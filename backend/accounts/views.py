# Auth, session, OTP password reset, and address endpoints.

import logging
import secrets
from datetime import timedelta

from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.hashers import check_password, make_password
from django.db import IntegrityError, transaction
from django.utils import timezone
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token
from rest_framework import generics, permissions, status, viewsets
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken, OutstandingToken
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenObtainPairView

from .models import Address, PasswordResetOTP
from .serializers import (
    AddressSerializer,
    EmailTokenObtainPairSerializer,
    OTPRequestSerializer,
    OTPVerifySerializer,
    PasswordResetSerializer,
    RegisterSerializer,
    UserSerializer,
)

User = get_user_model()
logger = logging.getLogger(__name__)

REFRESH_COOKIE = "apexwear_refresh"
COOKIE_KWARGS = dict(
    httponly=True,
    samesite="Lax",
    secure=not settings.DEBUG,
    path="/api/auth",
)

OTP_REQUEST_LIMIT = 3
OTP_REQUEST_WINDOW = timedelta(minutes=15)
OTP_RESEND_COOLDOWN = timedelta(seconds=30)


def _set_refresh_cookie(response, refresh_token: str) -> None:
    response.set_cookie(REFRESH_COOKIE, refresh_token, **COOKIE_KWARGS)


def _issue_session(user, *, created: bool) -> Response:
    refresh = RefreshToken.for_user(user)
    response = Response(
        {"access": str(refresh.access_token), "user": UserSerializer(user).data},
        status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
    )
    _set_refresh_cookie(response, str(refresh))
    return response


class RegisterView(generics.CreateAPIView):
    serializer_class = RegisterSerializer
    permission_classes = [permissions.AllowAny]

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        conflicts = []
        if User.objects.filter(email__iexact=data["email"]).exists():
            conflicts.append("email")
        if User.objects.filter(mobile=data["mobile"]).exists():
            conflicts.append("mobile")
        if conflicts:
            names = " and ".join(
                {"email": "Email ID", "mobile": "Mobile number"}[f] for f in conflicts
            )
            return Response(
                {"conflicts": conflicts, "detail": f"{names} already exists"},
                status=status.HTTP_409_CONFLICT,
            )

        try:
            user = serializer.save()
        except IntegrityError:
            # Pre-check above races under concurrent signups; DB unique constraint is the real guarantee.
            return Response(
                {"conflicts": ["email", "mobile"], "detail": "Email ID or mobile number already exists"},
                status=status.HTTP_409_CONFLICT,
            )
        return _issue_session(user, created=True)


class LoginView(TokenObtainPairView):
    serializer_class = EmailTokenObtainPairSerializer
    permission_classes = [permissions.AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "login"

    def post(self, request, *args, **kwargs):
        result = super().post(request, *args, **kwargs)
        if result.status_code != 200:
            return result
        refresh = result.data.pop("refresh")
        _set_refresh_cookie(result, refresh)
        return result


class GoogleLoginView(APIView):
    # Exchanges a Google ID token for our own JWT; never creates an account.
    permission_classes = [permissions.AllowAny]

    def post(self, request, *args, **kwargs):
        if not settings.GOOGLE_OAUTH_CLIENT_ID:
            return Response(
                {"detail": "Google sign-in is not configured on this server."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        credential = request.data.get("credential")
        if not credential:
            return Response(
                {"detail": "Missing credential."}, status=status.HTTP_400_BAD_REQUEST
            )

        try:
            # Verifies signature against Google's rotating keys plus audience/issuer/expiry.
            claims = id_token.verify_oauth2_token(
                credential, google_requests.Request(), settings.GOOGLE_OAUTH_CLIENT_ID
            )
        except ValueError:
            return Response(
                {"detail": "Invalid Google token."}, status=status.HTTP_401_UNAUTHORIZED
            )

        if not claims.get("email_verified"):
            return Response(
                {"detail": "Google account email is not verified."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        email = User.objects.normalize_email(claims["email"])
        # ponytail: keyed by verified email, no google_sub column — add one if a
        # user changing their Google email ever needs to survive it.
        user = User.objects.filter(email__iexact=email).first()
        if user is None:
            # Google only authenticates an existing account; it can't supply the
            # storefront's required profile fields, so registration stays separate.
            return Response(
                {
                    "detail": "No account found for this Google email.",
                    "code": "not_registered",
                    "email": email,
                },
                status=status.HTTP_404_NOT_FOUND,
            )

        return _issue_session(user, created=False)


class RefreshView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request, *args, **kwargs):
        raw_refresh = request.COOKIES.get(REFRESH_COOKIE)
        if not raw_refresh:
            return Response({"detail": "No refresh cookie."}, status=status.HTTP_401_UNAUTHORIZED)
        try:
            refresh = RefreshToken(raw_refresh)
        except TokenError:
            return Response({"detail": "Invalid or expired refresh token."}, status=status.HTTP_401_UNAUTHORIZED)
        response = Response({"access": str(refresh.access_token)})
        return response


def _revoke_all_refresh_tokens(user) -> int:
    # ponytail: OutstandingToken only tracks tokens minted after token_blacklist
    # was installed; older tokens just age out on their own.
    revoked = 0
    for outstanding in OutstandingToken.objects.filter(user=user):
        _, created = BlacklistedToken.objects.get_or_create(token=outstanding)
        revoked += int(created)
    return revoked


class LogoutView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request, *args, **kwargs):
        # Blacklist before dropping the cookie, or a copied refresh token stays replayable.
        raw_refresh = request.COOKIES.get(REFRESH_COOKIE)
        if raw_refresh:
            try:
                RefreshToken(raw_refresh).blacklist()
            except TokenError:
                pass
        response = Response(status=status.HTTP_204_NO_CONTENT)
        response.delete_cookie(REFRESH_COOKIE, path="/api/auth")
        return response


class MeView(generics.RetrieveUpdateDestroyAPIView):
    # GET/PATCH the current user; DELETE soft-deletes (is_active=False), Address/Order still point here.
    serializer_class = UserSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_object(self):
        return self.request.user

    def perform_destroy(self, instance):
        instance.is_active = False
        instance.save(update_fields=["is_active"])

    def destroy(self, request, *args, **kwargs):
        response = super().destroy(request, *args, **kwargs)
        response.delete_cookie(REFRESH_COOKIE, path="/api/auth")
        return response


def _generate_otp_code() -> str:
    return "".join(str(secrets.randbelow(10)) for _ in range(PasswordResetOTP.CODE_LENGTH))


def _send_otp(mobile: str, code: str) -> None:
    # ponytail: dev-mode console delivery only — swap in an SMS provider call here.
    if settings.DEBUG:
        logger.info("OTP for %s: %s", mobile, code)


class OTPRequestView(APIView):
    permission_classes = [permissions.AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "otp"

    def post(self, request, *args, **kwargs):
        serializer = OTPRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        mobile = serializer.validated_data["mobile"]

        # Same response whether or not the number is registered — never leak account existence.
        generic_response = Response({"detail": "If that number is registered, an OTP has been sent."})

        user = User.objects.filter(mobile=mobile).first()
        if not user:
            return generic_response

        window_start = timezone.now() - OTP_REQUEST_WINDOW
        recent_otps = PasswordResetOTP.objects.filter(user=user, created_at__gte=window_start)
        if recent_otps.count() >= OTP_REQUEST_LIMIT:
            return generic_response

        last_otp = recent_otps.order_by("-created_at").first()
        if last_otp and timezone.now() - last_otp.created_at < OTP_RESEND_COOLDOWN:
            return generic_response

        code = _generate_otp_code()
        PasswordResetOTP.objects.create(
            user=user,
            code_hash=make_password(code),
            expires_at=timezone.now() + timedelta(minutes=PasswordResetOTP.OTP_TTL_MINUTES),
        )
        _send_otp(mobile, code)

        data = generic_response.data
        if settings.DEBUG:
            data = {**data, "otp_debug": code}
        return Response(data)


class OTPVerifyView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request, *args, **kwargs):
        serializer = OTPVerifySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        mobile = serializer.validated_data["mobile"]
        code = serializer.validated_data["code"]

        user = User.objects.filter(mobile=mobile).first()
        otp = (
            PasswordResetOTP.objects.filter(user=user, consumed_at__isnull=True)
            .order_by("-created_at")
            .first()
            if user
            else None
        )

        invalid = Response({"detail": "Invalid or expired OTP.", "restart": True}, status=status.HTTP_400_BAD_REQUEST)
        if not otp or not otp.is_live():
            return invalid

        if not check_password(code, otp.code_hash):
            otp.attempts += 1
            if otp.attempts >= PasswordResetOTP.MAX_ATTEMPTS:
                otp.consumed_at = timezone.now()
                otp.save(update_fields=["attempts", "consumed_at"])
                return invalid
            otp.save(update_fields=["attempts"])
            return Response(
                {"detail": "Incorrect OTP.", "restart": False}, status=status.HTTP_400_BAD_REQUEST
            )

        reset_token = secrets.token_urlsafe(32)
        otp.token_hash = make_password(reset_token)
        otp.save(update_fields=["token_hash"])
        return Response({"reset_token": reset_token})


class PasswordResetView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request, *args, **kwargs):
        serializer = PasswordResetSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        mobile = serializer.validated_data["mobile"]
        reset_token = serializer.validated_data["reset_token"]
        password = serializer.validated_data["password"]

        user = User.objects.filter(mobile=mobile).first()
        invalid = Response({"detail": "Invalid or expired reset token."}, status=status.HTTP_400_BAD_REQUEST)
        if not user:
            return invalid

        # Scoped to this user's own rows, not all outstanding resets across every user.
        otp = PasswordResetOTP.objects.filter(
            user=user, consumed_at__isnull=True, token_hash__gt=""
        ).order_by("-created_at")
        matched = next((row for row in otp if check_password(reset_token, row.token_hash)), None)
        if not matched or not matched.is_live():
            return invalid

        with transaction.atomic():
            user.set_password(password)
            user.save(update_fields=["password"])
            matched.consumed_at = timezone.now()
            matched.save(update_fields=["consumed_at"])
            # A reset must kill every session under the old password, or it achieved nothing.
            _revoke_all_refresh_tokens(user)

        return _issue_session(user, created=False)


class AddressViewSet(viewsets.ModelViewSet):
    # Scoped to request.user — no IDOR, get_queryset filters so a guessed pk 404s.
    serializer_class = AddressSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return Address.objects.filter(user=self.request.user)
