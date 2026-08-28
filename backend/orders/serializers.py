# Cart, order, and checkout serializers.

from rest_framework import serializers

from catalog.serializers import VariantSerializer

from .models import Cart, CartItem, Order, OrderItem, Payment


class CartItemSerializer(serializers.ModelSerializer):
    variant = VariantSerializer(read_only=True)
    # Added here rather than widening VariantSerializer for every other caller that doesn't need them.
    product_name = serializers.CharField(source="variant.product.name", read_only=True)
    product_slug = serializers.CharField(source="variant.product.slug", read_only=True)
    image = serializers.SerializerMethodField()
    line_total = serializers.SerializerMethodField()  # server-computed, see cart_totals() in services.py

    class Meta:
        model = CartItem
        fields = ["id", "variant", "product_name", "product_slug", "image", "quantity", "line_total"]

    def get_image(self, obj):
        first = obj.variant.product.images.all()[:1]
        if not first:
            return None
        request = self.context.get("request")
        url = first[0].image.url
        return request.build_absolute_uri(url) if request else url

    def get_line_total(self, obj):
        return obj.variant.price * obj.quantity


class CartItemWriteSerializer(serializers.Serializer):
    # Input only — client sends a variant id + quantity, nothing priced.
    variant_id = serializers.IntegerField()
    quantity = serializers.IntegerField(min_value=1, default=1)


class CartSerializer(serializers.ModelSerializer):
    items = CartItemSerializer(many=True, read_only=True)
    subtotal = serializers.SerializerMethodField()
    shipping_fee = serializers.SerializerMethodField()
    total = serializers.SerializerMethodField()

    class Meta:
        model = Cart
        fields = ["id", "items", "subtotal", "shipping_fee", "total"]

    def _totals(self, obj):
        from .services import cart_totals  # local import avoids a circular import

        # Caches per-pk so subtotal/shipping_fee/total share one cart_totals() call instead of three.
        cached = getattr(self, "_totals_cache", None)
        if cached is None:
            cached = self._totals_cache = {}
        if obj.pk not in cached:
            cached[obj.pk] = cart_totals(obj)
        return cached[obj.pk]

    def get_subtotal(self, obj):
        return self._totals(obj)["subtotal"]

    def get_shipping_fee(self, obj):
        return self._totals(obj)["shipping_fee"]

    def get_total(self, obj):
        return self._totals(obj)["total"]


class OrderItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = OrderItem
        fields = [
            "product_name",
            "variant_size",
            "variant_colour",
            "sku",
            "unit_price",
            "quantity",
            "line_total",
        ]


class PaymentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Payment
        fields = ["status", "razorpay_order_id", "razorpay_payment_id", "created_at"]


class OrderSerializer(serializers.ModelSerializer):
    items = OrderItemSerializer(many=True, read_only=True)
    payments = PaymentSerializer(many=True, read_only=True)

    class Meta:
        model = Order
        fields = [
            "number",
            "status",
            "payment_method",
            "shipping_address",
            "subtotal",
            "shipping_fee",
            "total",
            "items",
            "payments",
            "created_at",
            "updated_at",  # order-detail timeline renders from this, not a status-history table
        ]


class CheckoutSerializer(serializers.Serializer):
    address_id = serializers.IntegerField()
    payment_method = serializers.ChoiceField(choices=Order.PaymentMethod.choices)
