from django.urls import path

from .views import (
    CartItemView,
    CartView,
    CheckoutView,
    OrderCancelView,
    OrderDetailView,
    OrderListView,
    razorpay_webhook,
)

urlpatterns = [
    path("cart/", CartView.as_view(), name="cart"),
    path("cart/items/<int:item_id>/", CartItemView.as_view(), name="cart-item"),
    path("checkout/", CheckoutView.as_view(), name="checkout"),
    path("orders/", OrderListView.as_view(), name="order-list"),
    path("orders/<str:number>/", OrderDetailView.as_view(), name="order-detail"),
    path("orders/<str:number>/cancel/", OrderCancelView.as_view(), name="order-cancel"),
    path("payments/webhook/", razorpay_webhook, name="razorpay-webhook"),
]
