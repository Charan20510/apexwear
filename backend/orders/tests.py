# Money-path tests: stock lock race, webhook idempotency, totals, price snapshot.

import hashlib
import hmac
import json
import threading
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.db import connection
from django.test import TestCase, TransactionTestCase, override_settings
from django.urls import reverse

from accounts.models import Address
from catalog.models import Category, Product, Variant

from .models import Cart, CartItem, Order, OrderItem, Payment
from .services import (
    OutOfStock,
    PaymentConfigError,
    razorpay_create_order,
    confirm_order,
    create_order_from_cart,
    verify_webhook_signature,
)

User = get_user_model()


def make_user(**overrides):
    defaults = {
        "email": "shopper@apexwear.test",
        "password": "Sunburn-Hoodie91",
        "first_name": "Shopper",
        "date_of_birth": "1995-06-15",
        "mobile": "9123456780",
        "gender": "female",
    }
    defaults.update(overrides)
    return User.objects.create_user(**defaults)


def make_variant(stock, price_override=None, **overrides):
    category = Category.objects.create(name="Oversized", slug="oversized-orders-test")
    product = Product.objects.create(
        name=overrides.pop("name", "Test Hoodie"),
        slug=overrides.pop("slug", "test-hoodie-orders"),
        category=category,
        base_price=Decimal("1799.00"),
    )
    return Variant.objects.create(
        product=product,
        size="M",
        colour="Black",
        sku="TEST-ORD-M",
        stock=stock,
        price_override=price_override,
        **overrides,
    )


def make_address(user):
    return Address.objects.create(
        user=user,
        name="Shopper",
        phone="9123456780",
        line1="221B Baker Street",
        city="Bengaluru",
        state="Karnataka",
        pincode="560001",
    )


class StockLockRaceTests(TransactionTestCase):
    # TransactionTestCase, not TestCase — needs real per-thread commits to exercise select_for_update.

    def setUp(self):
        self.variant = make_variant(stock=1)
        self.user_a = make_user(email="a@apexwear.test", mobile="9123456781")
        self.user_b = make_user(email="b@apexwear.test", mobile="9123456782")
        self.address_a = make_address(self.user_a)
        self.address_b = make_address(self.user_b)

    def _order_for(self, user, address):
        cart = Cart.objects.create(user=user)
        CartItem.objects.create(cart=cart, variant=self.variant, quantity=1)
        return create_order_from_cart(user, address, Order.PaymentMethod.COD)

    def test_only_one_of_two_concurrent_confirms_wins_the_last_unit(self):
        order_a = self._order_for(self.user_a, self.address_a)
        order_b = self._order_for(self.user_b, self.address_b)

        results = {}

        def confirm(name, order):
            try:
                confirm_order(order)
                results[name] = "ok"
            except OutOfStock:
                results[name] = "out_of_stock"
            finally:
                connection.close()  # each thread needs its own DB connection

        t1 = threading.Thread(target=confirm, args=("a", order_a))
        t2 = threading.Thread(target=confirm, args=("b", order_b))
        t1.start()
        t2.start()
        t1.join()
        t2.join()

        outcomes = list(results.values())
        self.assertEqual(outcomes.count("ok"), 1, results)
        self.assertEqual(outcomes.count("out_of_stock"), 1, results)
        self.variant.refresh_from_db()
        self.assertEqual(self.variant.stock, 0)


@override_settings(RAZORPAY_WEBHOOK_SECRET="test_webhook_secret")
class WebhookIdempotencyTests(TestCase):
    def setUp(self):
        self.user = make_user()
        self.variant = make_variant(stock=5)
        self.address = make_address(self.user)
        cart = Cart.objects.create(user=self.user)
        CartItem.objects.create(cart=cart, variant=self.variant, quantity=2)
        self.order = create_order_from_cart(self.user, self.address, Order.PaymentMethod.RAZORPAY)
        Payment.objects.create(
            order=self.order,
            razorpay_order_id="order_test123",
            amount_paise=int(self.order.total * 100),
            status=Payment.Status.CREATED,
        )

    def _event(self, payment_id="pay_test123"):
        return {
            "event": "payment.captured",
            "payload": {
                "payment": {
                    "entity": {
                        "id": payment_id,
                        "order_id": "order_test123",
                        "amount": int(self.order.total * 100),
                        "notes": {"order_number": self.order.number},
                    }
                }
            },
        }

    def _post_webhook(self, event):
        body = json.dumps(event).encode()
        signature = hmac.new(b"test_webhook_secret", body, hashlib.sha256).hexdigest()
        return self.client.post(
            reverse("razorpay-webhook"),
            data=body,
            content_type="application/json",
            HTTP_X_RAZORPAY_SIGNATURE=signature,
        )

    def test_replayed_webhook_decrements_stock_exactly_once(self):
        event = self._event()
        self._post_webhook(event)
        self._post_webhook(event)  # Razorpay-style retry of the identical event

        self.assertEqual(Payment.objects.filter(razorpay_payment_id="pay_test123").count(), 1)
        self.variant.refresh_from_db()
        self.assertEqual(self.variant.stock, 3)  # decremented once, not twice
        self.order.refresh_from_db()
        self.assertEqual(self.order.status, Order.Status.PAID)

    def test_tampered_body_is_rejected(self):
        event = self._event()
        body = json.dumps(event).encode()
        wrong_signature = hmac.new(b"wrong_secret", body, hashlib.sha256).hexdigest()
        response = self.client.post(
            reverse("razorpay-webhook"),
            data=body,
            content_type="application/json",
            HTTP_X_RAZORPAY_SIGNATURE=wrong_signature,
        )
        self.assertEqual(response.status_code, 400)
        self.order.refresh_from_db()
        self.assertEqual(self.order.status, Order.Status.PENDING)
        self.variant.refresh_from_db()
        self.assertEqual(self.variant.stock, 5)

    def test_verify_webhook_signature_uses_constant_time_compare(self):
        with override_settings(RAZORPAY_WEBHOOK_SECRET="s3cret"):
            body = b'{"a": 1}'
            good = hmac.new(b"s3cret", body, hashlib.sha256).hexdigest()
            self.assertTrue(verify_webhook_signature(body, good))
            self.assertFalse(verify_webhook_signature(body, "0" * 64))
            self.assertFalse(verify_webhook_signature(body, ""))

    def test_captured_amount_mismatch_does_not_confirm_the_order(self):
        event = self._event()
        event["payload"]["payment"]["entity"]["amount"] = int(self.order.total * 100) - 100
        self._post_webhook(event)

        self.order.refresh_from_db()
        self.assertEqual(self.order.status, Order.Status.PENDING)
        self.variant.refresh_from_db()
        self.assertEqual(self.variant.stock, 5)
        self.assertEqual(
            Payment.objects.get(razorpay_payment_id="pay_test123").status, Payment.Status.FAILED
        )


class ServerComputesTotalsTests(TestCase):
    def setUp(self):
        self.user = make_user()
        self.variant = make_variant(stock=10)
        self.address = make_address(self.user)
        self.client.force_login(self.user)

    def _login_headers(self):
        from rest_framework_simplejwt.tokens import RefreshToken

        token = RefreshToken.for_user(self.user).access_token
        return {"HTTP_AUTHORIZATION": f"Bearer {token}"}

    def test_checkout_total_ignores_any_client_sent_amount(self):
        cart = Cart.objects.create(user=self.user)
        CartItem.objects.create(cart=cart, variant=self.variant, quantity=2)

        response = self.client.post(
            reverse("checkout"),
            data=json.dumps(
                {
                    "address_id": self.address.id,
                    "payment_method": "cod",
    "total": "1.00",  # not a declared field — proves the server ignores it
                }
            ),
            content_type="application/json",
            **self._login_headers(),
        )
        self.assertEqual(response.status_code, 201, response.content)
        order = Order.objects.get(number=response.json()["number"])
        self.assertEqual(order.total, self.variant.price * 2)
        self.assertNotEqual(order.total, Decimal("1.00"))


class PriceSnapshotTests(TestCase):
    def test_order_item_price_survives_a_later_price_change(self):
        user = make_user()
        variant = make_variant(stock=10)
        address = make_address(user)
        original_price = variant.price

        cart = Cart.objects.create(user=user)
        CartItem.objects.create(cart=cart, variant=variant, quantity=1)
        order = create_order_from_cart(user, address, Order.PaymentMethod.COD)
        item = OrderItem.objects.get(order=order)
        self.assertEqual(item.unit_price, original_price)

        variant.price_override = Decimal("1.00")
        variant.save(update_fields=["price_override"])

        item.refresh_from_db()
        self.assertEqual(item.unit_price, original_price)
        self.assertNotEqual(item.unit_price, variant.price)


class InactiveProductTests(TestCase):
    def test_deactivated_product_cannot_be_added_to_cart(self):
        user = make_user()
        variant = make_variant(stock=10)
        variant.product.is_active = False
        variant.product.save(update_fields=["is_active"])

        self.client.force_login(user)
        from rest_framework_simplejwt.tokens import RefreshToken

        token = RefreshToken.for_user(user).access_token
        response = self.client.post(
            reverse("cart"),
            data=json.dumps({"variant_id": variant.id, "quantity": 1}),
            content_type="application/json",
            HTTP_AUTHORIZATION=f"Bearer {token}",
        )
        self.assertEqual(response.status_code, 404)

    def test_checkout_rejects_a_cart_line_deactivated_after_adding(self):
        user = make_user()
        variant = make_variant(stock=10)
        address = make_address(user)
        cart = Cart.objects.create(user=user)
        CartItem.objects.create(cart=cart, variant=variant, quantity=1)

        variant.product.is_active = False
        variant.product.save(update_fields=["is_active"])

        with self.assertRaises(ValueError):
            create_order_from_cart(user, address, Order.PaymentMethod.COD)


@override_settings(RAZORPAY_WEBHOOK_SECRET="test_webhook_secret")
class PaymentFailedWebhookTests(TestCase):
    def setUp(self):
        self.user = make_user()
        self.variant = make_variant(stock=5)
        self.address = make_address(self.user)
        cart = Cart.objects.create(user=self.user)
        CartItem.objects.create(cart=cart, variant=self.variant, quantity=2)
        self.order = create_order_from_cart(self.user, self.address, Order.PaymentMethod.RAZORPAY)
        Payment.objects.create(
            order=self.order,
            razorpay_order_id="order_fail1",
            amount_paise=int(self.order.total * 100),
            status=Payment.Status.CREATED,
        )

    def _post(self, payment_id="pay_fail1"):
        event = {
            "event": "payment.failed",
            "payload": {
                "payment": {
                    "entity": {
                        "id": payment_id,
                        "order_id": "order_fail1",
                        "amount": int(self.order.total * 100),
                        "notes": {"order_number": self.order.number},
                    }
                }
            },
        }
        body = json.dumps(event).encode()
        signature = hmac.new(b"test_webhook_secret", body, hashlib.sha256).hexdigest()
        return self.client.post(
            reverse("razorpay-webhook"),
            data=body,
            content_type="application/json",
            HTTP_X_RAZORPAY_SIGNATURE=signature,
        )

    def test_failed_payment_marks_the_order_failed_and_leaves_stock_alone(self):
        self._post()

        self.order.refresh_from_db()
        self.assertEqual(self.order.status, Order.Status.FAILED)
        self.variant.refresh_from_db()
        self.assertEqual(self.variant.stock, 5)  # nothing was ever decremented
        payment = Payment.objects.get(razorpay_payment_id="pay_fail1")
        self.assertEqual(payment.status, Payment.Status.FAILED)

    def test_failed_event_cannot_downgrade_an_already_paid_order(self):
        self.order.status = Order.Status.PAID
        self.order.save(update_fields=["status"])

        self._post(payment_id="pay_fail_late")

        self.order.refresh_from_db()
        self.assertEqual(self.order.status, Order.Status.PAID)


@override_settings(RAZORPAY_WEBHOOK_SECRET="test_webhook_secret")
class CapturedButOutOfStockTests(TestCase):
    # Payment already captured, then stock ran out — must land in AWAITING_REFUND, not stuck PENDING.

    def setUp(self):
        self.user = make_user()
        self.variant = make_variant(stock=2)
        self.address = make_address(self.user)
        cart = Cart.objects.create(user=self.user)
        CartItem.objects.create(cart=cart, variant=self.variant, quantity=2)
        self.order = create_order_from_cart(self.user, self.address, Order.PaymentMethod.RAZORPAY)
        Payment.objects.create(
            order=self.order,
            razorpay_order_id="order_oos1",
            amount_paise=int(self.order.total * 100),
            status=Payment.Status.CREATED,
        )
        Variant.objects.filter(pk=self.variant.pk).update(stock=0)  # sold out while paying

    def _post(self):
        event = {
            "event": "payment.captured",
            "payload": {
                "payment": {
                    "entity": {
                        "id": "pay_oos1",
                        "order_id": "order_oos1",
                        "amount": int(self.order.total * 100),
                        "notes": {"order_number": self.order.number},
                    }
                }
            },
        }
        body = json.dumps(event).encode()
        signature = hmac.new(b"test_webhook_secret", body, hashlib.sha256).hexdigest()
        return self.client.post(
            reverse("razorpay-webhook"),
            data=body,
            content_type="application/json",
            HTTP_X_RAZORPAY_SIGNATURE=signature,
        )

    def test_capture_with_no_stock_records_the_payment_and_flags_a_refund(self):
        response = self._post()

        self.assertEqual(response.status_code, 200)  # not 409 — a retry can't conjure stock
        self.order.refresh_from_db()
        self.assertEqual(self.order.status, Order.Status.AWAITING_REFUND)
        payment = Payment.objects.get(razorpay_payment_id="pay_oos1")
        self.assertEqual(payment.status, Payment.Status.CAPTURED)
        self.variant.refresh_from_db()
        self.assertEqual(self.variant.stock, 0)

    def test_retry_of_the_same_event_is_a_clean_no_op(self):
        self._post()
        self._post()

        self.assertEqual(Payment.objects.filter(razorpay_payment_id="pay_oos1").count(), 1)
        self.order.refresh_from_db()
        self.assertEqual(self.order.status, Order.Status.AWAITING_REFUND)


class CancelOnAbandonTests(TestCase):
    def setUp(self):
        self.user = make_user()
        self.variant = make_variant(stock=5)
        self.address = make_address(self.user)
        cart = Cart.objects.create(user=self.user)
        CartItem.objects.create(cart=cart, variant=self.variant, quantity=1)
        self.order = create_order_from_cart(self.user, self.address, Order.PaymentMethod.RAZORPAY)

    def _url(self):
        return reverse("order-cancel", args=[self.order.number])

    def _auth(self, user):  # JWT bearer, not force_login — these endpoints use simplejwt
        from rest_framework_simplejwt.tokens import RefreshToken

        return {"HTTP_AUTHORIZATION": f"Bearer {RefreshToken.for_user(user).access_token}"}

    def test_cancels_a_pending_order(self):
        response = self.client.post(self._url(), **self._auth(self.user))

        self.assertEqual(response.status_code, 200)
        self.order.refresh_from_db()
        self.assertEqual(self.order.status, Order.Status.CANCELLED)
        self.variant.refresh_from_db()
        self.assertEqual(self.variant.stock, 5)  # nothing to restore, nothing taken

    def test_cannot_cancel_an_already_paid_order(self):
        self.order.status = Order.Status.PAID
        self.order.save(update_fields=["status"])

        self.client.post(self._url(), **self._auth(self.user))

        self.order.refresh_from_db()
        self.assertEqual(self.order.status, Order.Status.PAID)

    def test_cannot_cancel_another_customers_order(self):
        other = make_user(email="intruder@apexwear.test", mobile="9123456781")

        response = self.client.post(self._url(), **self._auth(other))

        self.assertEqual(response.status_code, 404)
        self.order.refresh_from_db()
        self.assertEqual(self.order.status, Order.Status.PENDING)


class CartStockGuardTests(TestCase):
    def setUp(self):
        self.user = make_user()
        self.variant = make_variant(stock=3)

    def _auth(self):
        from rest_framework_simplejwt.tokens import RefreshToken

        return {"HTTP_AUTHORIZATION": f"Bearer {RefreshToken.for_user(self.user).access_token}"}

    def test_cannot_add_more_than_stock(self):
        res = self.client.post(
            reverse("cart"),
            {"variant_id": self.variant.id, "quantity": 4},
            content_type="application/json",
            **self._auth(),
        )
        self.assertEqual(res.status_code, 409)
        self.assertEqual(res.json()["available"], 3)
        self.assertEqual(CartItem.objects.count(), 0, "the rejected line must not linger")

    def test_repeated_adds_cannot_creep_past_stock(self):
        for _ in range(3):
            self.client.post(
                reverse("cart"),
                {"variant_id": self.variant.id, "quantity": 1},
                content_type="application/json",
                **self._auth(),
            )
        res = self.client.post(
            reverse("cart"),
            {"variant_id": self.variant.id, "quantity": 1},
            content_type="application/json",
            **self._auth(),
        )
        self.assertEqual(res.status_code, 409)
        self.assertEqual(CartItem.objects.get().quantity, 3)

    def test_patch_cannot_raise_quantity_past_stock(self):
        self.client.post(
            reverse("cart"),
            {"variant_id": self.variant.id, "quantity": 1},
            content_type="application/json",
            **self._auth(),
        )
        item = CartItem.objects.get()
        res = self.client.patch(
            reverse("cart-item", args=[item.id]),
            {"quantity": 99},
            content_type="application/json",
            **self._auth(),
        )
        self.assertEqual(res.status_code, 409)
        item.refresh_from_db()
        self.assertEqual(item.quantity, 1)


class CartQueryCountTests(TestCase):
    # Pins the cart's query count — was ~31 for 10 lines before the prefetch.

    def setUp(self):
        self.user = make_user()
        cart = Cart.objects.create(user=self.user)
        category = Category.objects.create(name="Oversized", slug="oversized-qc")
        for i in range(10):
            product = Product.objects.create(
                name=f"Hoodie {i}", slug=f"hoodie-qc-{i}", category=category,
                base_price=Decimal("1799.00"),
            )
            variant = Variant.objects.create(
                product=product, size="M", colour="Black", sku=f"QC-{i}", stock=5,
            )
            CartItem.objects.create(cart=cart, variant=variant, quantity=1)

    def test_cart_read_does_not_scale_with_line_count(self):
        from rest_framework_simplejwt.tokens import RefreshToken

        auth = {"HTTP_AUTHORIZATION": f"Bearer {RefreshToken.for_user(self.user).access_token}"}
        with self.assertNumQueries(8):  # must not scale with line count
            res = self.client.get(reverse("cart"), **auth)
        self.assertEqual(res.status_code, 200)
        self.assertEqual(len(res.json()["items"]), 10)


@override_settings(
    RAZORPAY_KEY_ID="rzp_test_x",
    RAZORPAY_KEY_SECRET="s",
    RAZORPAY_WEBHOOK_SECRET="https://x.ngrok-free.app",
)
class WebhookSecretMisconfigTests(TestCase):
    # A URL pasted into RAZORPAY_WEBHOOK_SECRET breaks every webhook signature check.

    def test_checkout_refuses_rather_than_charging_a_card_it_cannot_confirm(self):
        user = make_user()
        variant = make_variant(stock=5)
        address = make_address(user)
        cart = Cart.objects.create(user=user)
        CartItem.objects.create(cart=cart, variant=variant, quantity=1)
        order = create_order_from_cart(user, address, Order.PaymentMethod.RAZORPAY)

        with self.assertRaises(PaymentConfigError):
            razorpay_create_order(int(order.total * 100), order.number)

    def test_system_check_flags_a_url_secret(self):
        from orders.checks import razorpay_config

        self.assertIn("orders.W003", [w.id for w in razorpay_config(None)])

    def test_a_real_secret_passes_the_check(self):
        with override_settings(RAZORPAY_WEBHOOK_SECRET="a-real-secret-string"):
            from orders.checks import razorpay_config

            self.assertEqual([w.id for w in razorpay_config(None)], [])
