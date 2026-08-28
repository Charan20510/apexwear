from django.contrib import admin

from .models import Order, OrderItem, Payment


class OrderItemInline(admin.TabularInline):
    model = OrderItem
    extra = 0
    readonly_fields = [f.name for f in OrderItem._meta.fields if f.name not in ("id", "order")]
    can_delete = False


class PaymentInline(admin.TabularInline):
    model = Payment
    extra = 0
    readonly_fields = ["razorpay_order_id", "razorpay_payment_id", "status", "amount_paise", "created_at"]
    can_delete = False


@admin.register(Order)
class OrderAdmin(admin.ModelAdmin):
    list_display = ["number", "user", "status", "payment_method", "total", "created_at"]
    list_filter = ["status", "payment_method"]
    search_fields = ["number", "user__email"]
    readonly_fields = ["number", "subtotal", "shipping_fee", "total", "shipping_address"]
    inlines = [OrderItemInline, PaymentInline]
