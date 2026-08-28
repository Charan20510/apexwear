# Cart, Order, OrderItem, and Payment models.

import secrets
from datetime import date

from django.conf import settings
from django.db import models

from catalog.models import Variant


def generate_order_number() -> str:
    # Date + 6 random hex chars — readable; the DB unique constraint is the real guarantee.
    return f"APX-{date.today():%Y%m%d}-{secrets.token_hex(3).upper()}"


class Cart(models.Model):
    # One cart per user — no guest cart, /cart is already gated behind login.
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="cart")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Cart({self.user_id})"


class CartItem(models.Model):
    cart = models.ForeignKey(Cart, on_delete=models.CASCADE, related_name="items")
    variant = models.ForeignKey(Variant, on_delete=models.PROTECT, related_name="cart_items")
    quantity = models.PositiveIntegerField(default=1)
    added_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("cart", "variant")

    def __str__(self):
        return f"{self.quantity} x {self.variant} (cart {self.cart_id})"


class Order(models.Model):
    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        PAID = "paid", "Paid"
        CONFIRMED = "confirmed", "Confirmed"  # COD's PAID-equivalent
        FAILED = "failed", "Failed"
        CANCELLED = "cancelled", "Cancelled"
        # Money captured but stock was gone by the time the webhook landed — owes a refund.
        AWAITING_REFUND = "awaiting_refund", "Awaiting refund"

    class PaymentMethod(models.TextChoices):
        RAZORPAY = "razorpay", "Razorpay"
        COD = "cod", "Cash on delivery"

    number = models.CharField(max_length=32, unique=True, default=generate_order_number)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="orders")
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)
    payment_method = models.CharField(max_length=10, choices=PaymentMethod.choices)
    shipping_address = models.JSONField()  # snapshot, never a live Address FK
    subtotal = models.DecimalField(max_digits=10, decimal_places=2)
    shipping_fee = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    total = models.DecimalField(max_digits=10, decimal_places=2)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["user", "-created_at"])]

    def __str__(self):
        return self.number


class OrderItem(models.Model):
    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name="items")
    # nullable + PROTECT: variant may still exist, but every field below is a snapshot at checkout.
    variant = models.ForeignKey(Variant, on_delete=models.PROTECT, null=True, related_name="order_items")
    product_name = models.CharField(max_length=200)
    variant_size = models.CharField(max_length=10)
    variant_colour = models.CharField(max_length=50)
    sku = models.CharField(max_length=64)
    unit_price = models.DecimalField(max_digits=10, decimal_places=2)
    quantity = models.PositiveIntegerField()
    line_total = models.DecimalField(max_digits=10, decimal_places=2)

    def __str__(self):
        return f"{self.quantity} x {self.product_name} ({self.variant_size}/{self.variant_colour})"


class Payment(models.Model):
    class Status(models.TextChoices):
        CREATED = "created", "Created"
        CAPTURED = "captured", "Captured"
        FAILED = "failed", "Failed"

    # PROTECT: carries the gateway's raw_event, the reconciliation trail — never cascade-delete it.
    order = models.ForeignKey(Order, on_delete=models.PROTECT, related_name="payments")
    razorpay_order_id = models.CharField(max_length=64, blank=True)
    # unique + nullable: the webhook idempotency key — get_or_create on this field.
    razorpay_payment_id = models.CharField(max_length=64, unique=True, null=True, blank=True)
    signature = models.CharField(max_length=256, blank=True)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.CREATED)
    amount_paise = models.PositiveIntegerField()
    raw_event = models.JSONField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Payment({self.razorpay_payment_id or self.razorpay_order_id})"
