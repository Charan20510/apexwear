from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    AddressViewSet,
    GoogleLoginView,
    LoginView,
    LogoutView,
    MeView,
    OTPRequestView,
    OTPVerifyView,
    PasswordResetView,
    RefreshView,
    RegisterView,
)

router = DefaultRouter()
router.register("addresses", AddressViewSet, basename="address")

urlpatterns = [
    path("register", RegisterView.as_view(), name="auth-register"),
    path("login", LoginView.as_view(), name="auth-login"),
    path("google", GoogleLoginView.as_view(), name="auth-google"),
    path("refresh", RefreshView.as_view(), name="auth-refresh"),
    path("logout", LogoutView.as_view(), name="auth-logout"),
    path("me", MeView.as_view(), name="auth-me"),
    path("otp/request", OTPRequestView.as_view(), name="auth-otp-request"),
    path("otp/verify", OTPVerifyView.as_view(), name="auth-otp-verify"),
    path("password/reset", PasswordResetView.as_view(), name="auth-password-reset"),
    path("", include(router.urls)),
]
