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
from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenObtainPairView

from .models import PasswordResetOTP
from .serializers import (
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
            # The pre-check above races under concurrent signups; the DB's unique
            # constraints are the real guarantee, this is just a clean response
            # for the rare loser of that race.
            return Response(
                {"conflicts": ["email", "mobile"], "detail": "Email ID or mobile number already exists"},
                status=status.HTTP_409_CONFLICT,
            )
        return _issue_session(user, created=True)


class LoginView(TokenObtainPairView):
    serializer_class = EmailTokenObtainPairSerializer
    permission_classes = [permissions.AllowAny]

    def post(self, request, *args, **kwargs):
        result = super().post(request, *args, **kwargs)
        if result.status_code != 200:
            return result
        refresh = result.data.pop("refresh")
        _set_refresh_cookie(result, refresh)
        return result


class GoogleLoginView(APIView):
    """Exchange a Google ID token for our own JWT.

    Google replaces the password check only — the session that follows is the same
    access token + refresh cookie every other login path issues.
    """

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
            # The security boundary: checks signature against Google's rotating public
            # keys, plus audience, issuer and expiry. Never decode this token unverified.
            claims = id_token.verify_oauth2_token(
                credential, google_requests.Request(), settings.GOOGLE_OAUTH_CLIENT_ID
            )
        except ValueError:
            return Response(
                {"detail": "Invalid Google token."}, status=status.HTTP_401_UNAUTHORIZED
            )

        # Google must vouch for the mailbox. Without this an attacker could claim any
        # email and take over the matching account.
        if not claims.get("email_verified"):
            return Response(
                {"detail": "Google account email is not verified."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        email = User.objects.normalize_email(claims["email"])
        # ponytail: accounts are keyed by verified email, with no google_sub column.
        # Add one if surviving a user changing their Google email ever matters.
        user = User.objects.filter(email__iexact=email).first()
        if user is None:
            # Google sign-in only authenticates an existing account — it never creates
            # one, since Google can't supply the storefront's required profile fields
            # (DOB/mobile/gender). The frontend sends the user to /register instead.
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
        # simplejwt ROTATE_REFRESH_TOKENS is off by default, so the cookie is unchanged.
        return response


class LogoutView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request, *args, **kwargs):
        response = Response(status=status.HTTP_204_NO_CONTENT)
        response.delete_cookie(REFRESH_COOKIE, path="/api/auth")
        return response


class MeView(generics.RetrieveUpdateDestroyAPIView):
    """GET/PATCH the current user's profile; DELETE deactivates the account.

    DELETE is a soft delete (`is_active=False`), not a row delete — `Address` (and
    Phase 3's `Order`) point at this user, and simplejwt's `JWTAuthentication`
    already refuses an inactive user's token on the very next request, so this is
    enough to actually log them out everywhere immediately. ponytail: a real
    hard-delete/data-retention path is a policy decision, not guessed at here.
    """

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
    return "".join(str(secrets.randbelow(10)) for _ in range(4))


def _send_otp(mobile: str, code: str) -> None:
    # ponytail: dev-mode console delivery, no SMS provider configured. Swap this
    # function's body for an MSG91/Twilio call (key in .env) when one exists —
    # nothing else about the OTP flow needs to change.
    # The code is only ever logged in DEBUG: the `accounts` logger has a console
    # handler at INFO in every environment, so an unguarded log line would put live
    # OTPs into production logs.
    if settings.DEBUG:
        logger.info("OTP for %s: %s", mobile, code)


class OTPRequestView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request, *args, **kwargs):
        serializer = OTPRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        mobile = serializer.validated_data["mobile"]

        # Identical response whether or not the number is registered — never leak
        # account existence through this endpoint.
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

        # Scoped to this user's own rows — without this a valid token check was O(all
        # outstanding resets across every user) and unbounded by who the caller claims to be.
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

        return _issue_session(user, created=False)
