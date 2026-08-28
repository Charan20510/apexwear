# Order/payment money logic: stock lock, totals, Razorpay webhook.

import hashlib
import hmac
import logging
from decimal import Decimal

import requests
from django.conf import settings
from django.db import transaction

logger = logging.getLogger(__name__)

from catalog.models import Variant

from .models import Cart, CartItem, Order, OrderItem, Payment

RAZORPAY_API = "https://api.razorpay.com/v1"
# ponytail: flat shipping, add slabs/pincode rules when the business needs them.
SHIPPING_FEE = Decimal("0.00")


class OutOfStock(Exception):
    def __init__(self, variant, requested, available):
        self.variant = variant
        self.requested = requested
        self.available = available
        super().__init__(
            f"{variant} — requested {requested}, only {available} left"
        )


class PaymentConfigError(Exception):
    pass


def get_or_create_cart(user) -> Cart:
    cart, _ = Cart.objects.get_or_create(user=user)
    return cart


def cart_totals(cart) -> dict:
    # Recomputed from live Variant.price every call — cart never stores a price.
    subtotal = Decimal("0.00")
    for item in cart.items.select_related("variant", "variant__product"):
        subtotal += item.variant.price * item.quantity
    return {
        "subtotal": subtotal,
        "shipping_fee": SHIPPING_FEE,
        "total": subtotal + SHIPPING_FEE,
    }


def snapshot_address(address) -> dict:
    return {
        "name": address.name,
        "phone": address.phone,
        "line1": address.line1,
        "line2": address.line2,
        "city": address.city,
        "state": address.state,
        "pincode": address.pincode,
    }


@transaction.atomic
def create_order_from_cart(user, address, payment_method) -> Order:
    # Draft only — stock is validated here but not decremented, that's confirm_order().
    cart = get_or_create_cart(user)
    items = list(cart.items.select_related("variant", "variant__product"))
    if not items:
        raise ValueError("Cart is empty")

    for item in items:
        if not item.variant.product.is_active:
            raise ValueError(f"{item.variant.product.name} is no longer available")
        if item.variant.stock < item.quantity:
            raise OutOfStock(item.variant, item.quantity, item.variant.stock)

    totals = cart_totals(cart)
    order = Order.objects.create(
        user=user,
        payment_method=payment_method,
        shipping_address=snapshot_address(address),
        subtotal=totals["subtotal"],
        shipping_fee=totals["shipping_fee"],
        total=totals["total"],
    )
    OrderItem.objects.bulk_create(
        [
            OrderItem(
                order=order,
                variant=item.variant,
                product_name=item.variant.product.name,
                variant_size=item.variant.size,
                variant_colour=item.variant.colour,
                sku=item.variant.sku,
                unit_price=item.variant.price,
                quantity=item.quantity,
                line_total=item.variant.price * item.quantity,
            )
            for item in items
        ]
    )
    return order


def confirm_order(order: Order) -> Order:
    # Decrements stock under select_for_update; no-op unless order is PENDING.
    with transaction.atomic():
        locked_order = Order.objects.select_for_update().get(pk=order.pk)
        if locked_order.status != Order.Status.PENDING:
            return locked_order

        items = list(locked_order.items.all())
        variant_ids = sorted(i.variant_id for i in items if i.variant_id)
        # Sorted order avoids deadlocking against a concurrent order sharing variants.
        locked_variants = {
            v.id: v for v in Variant.objects.select_for_update().filter(id__in=variant_ids).order_by("id")
        }

        for item in items:
            variant = locked_variants.get(item.variant_id)
            if variant is None:
                continue
            if variant.stock < item.quantity:
                raise OutOfStock(variant, item.quantity, variant.stock)

        for item in items:
            variant = locked_variants.get(item.variant_id)
            if variant is None:
                continue
            variant.stock -= item.quantity
            variant.save(update_fields=["stock"])

        locked_order.status = (
            Order.Status.CONFIRMED
            if locked_order.payment_method == Order.PaymentMethod.COD
            else Order.Status.PAID
        )
        locked_order.save(update_fields=["status", "updated_at"])

        CartItem.objects.filter(cart__user=locked_order.user).delete()
        return locked_order


def to_paise(amount: Decimal) -> int:
    return int((amount * 100).to_integral_value())


def razorpay_create_order(amount_paise: int, order_number: str) -> dict:
    if not settings.RAZORPAY_KEY_ID or not settings.RAZORPAY_KEY_SECRET:
        raise PaymentConfigError("Razorpay keys are not configured")
    # Refuse before charging if the webhook can't verify — otherwise we take money
    # and never confirm the order.
    webhook_secret = settings.RAZORPAY_WEBHOOK_SECRET
    if not webhook_secret:
        raise PaymentConfigError("RAZORPAY_WEBHOOK_SECRET is not set")
    if webhook_secret.startswith(("http://", "https://")):
        raise PaymentConfigError("RAZORPAY_WEBHOOK_SECRET is a URL, not a secret")
    response = requests.post(
        f"{RAZORPAY_API}/orders",
        auth=(settings.RAZORPAY_KEY_ID, settings.RAZORPAY_KEY_SECRET),
        json={
            "amount": amount_paise,
            "currency": "INR",
            "receipt": order_number,
            "notes": {"order_number": order_number},
        },
        timeout=15,
    )
    response.raise_for_status()
    return response.json()


def verify_webhook_signature(body: bytes, header_signature: str) -> bool:
    # Must hash the raw body — re-serializing parsed JSON would change the bytes.
    secret = settings.RAZORPAY_WEBHOOK_SECRET
    if not secret or not header_signature:
        return False
    expected = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, header_signature)


def _find_order_for_payment(entity: dict) -> Order | None:
    # notes.order_number first, falling back to the Payment row's razorpay_order_id.
    order_number = entity.get("notes", {}).get("order_number")
    if order_number:
        order = Order.objects.filter(number=order_number).first()
        if order is not None:
            return order
    razorpay_order_id = entity.get("order_id", "")
    if razorpay_order_id:
        return Order.objects.filter(payments__razorpay_order_id=razorpay_order_id).first()
    return None


def handle_payment_captured(event: dict) -> Payment | None:
    # Idempotent via get_or_create on razorpay_payment_id — a retried webhook no-ops.
    entity = event.get("payload", {}).get("payment", {}).get("entity", {})
    payment_id = entity.get("id")
    razorpay_order_id = entity.get("order_id", "")
    if not payment_id:
        return None

    order = _find_order_for_payment(entity)
    if order is None:
        logger.error(
            "Webhook payment.captured (payment_id=%s, order_id=%s) matched no Order",
            payment_id,
            razorpay_order_id,
        )
        return None

    captured_amount = entity.get("amount")
    expected_amount = to_paise(order.total)
    if captured_amount is not None and captured_amount != expected_amount:
        logger.error(
            "Webhook payment.captured amount mismatch for order %s: captured=%s expected=%s",
            order.number,
            captured_amount,
            expected_amount,
        )
        Payment.objects.get_or_create(
            razorpay_payment_id=payment_id,
            defaults={
                "order": order,
                "razorpay_order_id": razorpay_order_id,
                "status": Payment.Status.FAILED,
                "amount_paise": captured_amount,
                "raw_event": event,
            },
        )
        return None

    payment, created = Payment.objects.get_or_create(
        razorpay_payment_id=payment_id,
        defaults={
            "order": order,
            "razorpay_order_id": razorpay_order_id,
            "status": Payment.Status.CAPTURED,
            "amount_paise": captured_amount or expected_amount,
            "raw_event": event,
        },
    )
    if not created:
        return payment  # replay — already handled

    try:
        confirm_order(order)
    except OutOfStock as exc:
        # Money was taken and can't be un-taken by a retry — move to AWAITING_REFUND
        # so ops can see and refund it, rather than leaving the order stuck PENDING.
        logger.error(
            "Order %s paid (payment_id=%s) but stock ran out — refund owed: %s",
            order.number,
            payment_id,
            exc,
        )
        Order.objects.filter(pk=order.pk, status=Order.Status.PENDING).update(
            status=Order.Status.AWAITING_REFUND
        )
    return payment


def handle_payment_failed(event: dict) -> Payment | None:
    entity = event.get("payload", {}).get("payment", {}).get("entity", {})
    payment_id = entity.get("id")
    if not payment_id:
        return None

    order = _find_order_for_payment(entity)
    if order is None:
        logger.error("Webhook payment.failed (payment_id=%s) matched no Order", payment_id)
        return None

    payment, created = Payment.objects.get_or_create(
        razorpay_payment_id=payment_id,
        defaults={
            "order": order,
            "razorpay_order_id": entity.get("order_id", ""),
            "status": Payment.Status.FAILED,
            "amount_paise": entity.get("amount") or to_paise(order.total),
            "raw_event": event,
        },
    )
    if not created:
        return payment

    Order.objects.filter(pk=order.pk, status=Order.Status.PENDING).update(status=Order.Status.FAILED)
    return payment


def cancel_order(order: Order) -> Order:
    # Only ever PENDING -> CANCELLED, so a real payment can't be undone by the browser.
    # ponytail: a browser closed outright never reports, so it stays PENDING —
    # a stale-PENDING sweep is Phase 5 ops work.
    Order.objects.filter(pk=order.pk, status=Order.Status.PENDING).update(
        status=Order.Status.CANCELLED
    )
    order.refresh_from_db()
    return order
