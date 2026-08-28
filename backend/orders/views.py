# Cart, checkout, order, and Razorpay webhook endpoints.

import json
import logging

import requests

from django.conf import settings
from django.shortcuts import get_object_or_404
from django.views.decorators.csrf import csrf_exempt
from rest_framework import permissions, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from accounts.models import Address
from catalog.models import Variant

from .models import Cart, CartItem, Order, Payment
from .serializers import (
    CartItemWriteSerializer,
    CartSerializer,
    CheckoutSerializer,
    OrderSerializer,
)
from .services import (
    OutOfStock,
    PaymentConfigError,
    cancel_order,
    confirm_order,
    create_order_from_cart,
    get_or_create_cart,
    handle_payment_captured,
    handle_payment_failed,
    razorpay_create_order,
    to_paise,
    verify_webhook_signature,
)

logger = logging.getLogger(__name__)


def _cart_for_response(user) -> Cart:
    # Prefetches variant/product/images — avoids ~3 extra queries per line.
    cart = get_or_create_cart(user)
    return (
        Cart.objects.prefetch_related("items__variant__product__images")
        .filter(pk=cart.pk)
        .first()
    )


class CartView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        cart = _cart_for_response(request.user)
        return Response(CartSerializer(cart, context={"request": request}).data)

    def post(self, request):
        serializer = CartItemWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        # Re-enforces is_active so a stale cart/guessed variant id can't buy a delisted product.
        variant = get_object_or_404(
            Variant, pk=serializer.validated_data["variant_id"], product__is_active=True
        )
        cart = get_or_create_cart(request.user)
        item, created = CartItem.objects.get_or_create(
            cart=cart, variant=variant, defaults={"quantity": serializer.validated_data["quantity"]}
        )
        wanted = item.quantity if created else item.quantity + serializer.validated_data["quantity"]
        # Advisory only — confirm_order() re-checks under select_for_update at checkout.
        if wanted > variant.stock:
            if created:
                item.delete()
            return Response(
                {"detail": f"Only {variant.stock} left in that size.", "available": variant.stock},
                status=status.HTTP_409_CONFLICT,
            )
        if not created:
            item.quantity = wanted
            item.save(update_fields=["quantity"])
        return Response(
            CartSerializer(_cart_for_response(request.user), context={"request": request}).data,
            status=status.HTTP_201_CREATED,
        )

    def delete(self, request):
        get_or_create_cart(request.user).items.all().delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class CartItemView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def _get_item(self, request, item_id):
        return get_object_or_404(CartItem, pk=item_id, cart__user=request.user)

    def patch(self, request, item_id):
        item = self._get_item(request, item_id)
        quantity = request.data.get("quantity")
        if not isinstance(quantity, int) or quantity < 1:
            return Response({"detail": "quantity must be a positive integer"}, status=400)
        if quantity > item.variant.stock:
            return Response(
                {"detail": f"Only {item.variant.stock} left in that size.", "available": item.variant.stock},
                status=status.HTTP_409_CONFLICT,
            )
        item.quantity = quantity
        item.save(update_fields=["quantity"])
        return Response(
            CartSerializer(_cart_for_response(request.user), context={"request": request}).data
        )

    def delete(self, request, item_id):
        item = self._get_item(request, item_id)
        item.delete()
        return Response(
            CartSerializer(_cart_for_response(request.user), context={"request": request}).data
        )


class CheckoutView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "checkout"

    def post(self, request):
        serializer = CheckoutSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        address = get_object_or_404(
            Address, pk=serializer.validated_data["address_id"], user=request.user
        )
        payment_method = serializer.validated_data["payment_method"]

        try:
            order = create_order_from_cart(request.user, address, payment_method)
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=400)
        except OutOfStock as exc:
            return Response({"detail": str(exc)}, status=409)

        if payment_method == Order.PaymentMethod.COD:
            confirm_order(order)
            order.refresh_from_db()
            return Response(OrderSerializer(order).data, status=201)

        # A config/network failure here marks the order FAILED rather than stranding it PENDING.
        try:
            gateway_order = razorpay_create_order(to_paise(order.total), order.number)
        except (PaymentConfigError, requests.RequestException) as exc:
            logger.error("Razorpay order creation failed for %s: %s", order.number, exc)
            order.status = Order.Status.FAILED
            order.save(update_fields=["status", "updated_at"])
            return Response(
                {"detail": "Online payment is unavailable right now. Please try Cash on delivery."},
                status=503,
            )

        Payment.objects.create(
            order=order,
            razorpay_order_id=gateway_order["id"],
            amount_paise=to_paise(order.total),
            status=Payment.Status.CREATED,
        )
        return Response(
            {
                "order": OrderSerializer(order).data,
                "razorpay_order_id": gateway_order["id"],
                "razorpay_key_id": settings.RAZORPAY_KEY_ID,
            },
            status=201,
        )


class OrderListView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        orders = Order.objects.filter(user=request.user).prefetch_related("items", "payments")
        return Response(OrderSerializer(orders, many=True).data)


class OrderDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, number):
        order = get_object_or_404(Order, number=number, user=request.user)
        return Response(OrderSerializer(order).data)


class OrderCancelView(APIView):
    # Only ever PENDING -> CANCELLED, so this can't undo a webhook-confirmed payment.
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, number):
        order = get_object_or_404(Order, number=number, user=request.user)
        return Response(OrderSerializer(cancel_order(order)).data)


@csrf_exempt
@api_view(["POST"])
@permission_classes([permissions.AllowAny])
def razorpay_webhook(request):
    # Source of truth for payment status, never the browser callback. Verifies the
    # raw body's signature before parsing; idempotent via Payment's unique constraint.
    signature = request.headers.get("X-Razorpay-Signature", "")
    if not verify_webhook_signature(request.body, signature):
        # Named separately so a config mistake doesn't log identically to a real forgery.
        configured = settings.RAZORPAY_WEBHOOK_SECRET
        if not configured:
            logger.error(
                "Webhook rejected: RAZORPAY_WEBHOOK_SECRET is not set, so no webhook can "
                "ever verify. Payments will succeed but orders will stay PENDING."
            )
        elif configured.startswith(("http://", "https://")):
            logger.error(
                "Webhook rejected: RAZORPAY_WEBHOOK_SECRET is a URL, not a secret — it "
                "looks like the webhook endpoint was pasted into the secret field. "
                "No webhook can verify until this is fixed."
            )
        elif not signature:
            logger.warning("Webhook rejected: no X-Razorpay-Signature header on the request.")
        else:
            logger.warning("Rejected webhook: bad signature")
        return Response({"detail": "invalid signature"}, status=400)

    event = json.loads(request.body)
    name = event.get("event")
    if name == "payment.captured":
        # Sold-out-during-payment resolves inside the handler (-> AWAITING_REFUND);
        # always 200 once the signature checks out, so Razorpay doesn't retry forever.
        handle_payment_captured(event)
    elif name == "payment.failed":
        handle_payment_failed(event)

    return Response({"status": "ok"})
