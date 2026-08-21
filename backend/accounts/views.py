from django.conf import settings
from django.contrib.auth import get_user_model
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token
from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenObtainPairView

from .serializers import EmailTokenObtainPairSerializer, RegisterSerializer, UserSerializer

User = get_user_model()

REFRESH_COOKIE = "apexwear_refresh"
COOKIE_KWARGS = dict(
    httponly=True,
    samesite="Lax",
    secure=not settings.DEBUG,
    path="/api/auth",
)


def _set_refresh_cookie(response, refresh_token: str) -> None:
    response.set_cookie(REFRESH_COOKIE, refresh_token, **COOKIE_KWARGS)


class RegisterView(generics.CreateAPIView):
    serializer_class = RegisterSerializer
    permission_classes = [permissions.AllowAny]

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        refresh = RefreshToken.for_user(user)
        response = Response(
            {"access": str(refresh.access_token), "user": UserSerializer(user).data},
            status=status.HTTP_201_CREATED,
        )
        _set_refresh_cookie(response, str(refresh))
        return response


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
        user, created = User.objects.get_or_create(
            email=email,
            defaults={
                "first_name": claims.get("given_name", ""),
                "last_name": claims.get("family_name", ""),
            },
        )
        if created:
            user.set_unusable_password()
            user.save(update_fields=["password"])

        refresh = RefreshToken.for_user(user)
        response = Response(
            {"access": str(refresh.access_token), "user": UserSerializer(user).data},
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )
        _set_refresh_cookie(response, str(refresh))
        return response


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


class MeView(generics.RetrieveAPIView):
    serializer_class = UserSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_object(self):
        return self.request.user
