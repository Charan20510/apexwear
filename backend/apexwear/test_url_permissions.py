# Walks the real URLconf and pins the public/private answer for every registered URL.

from django.test import SimpleTestCase
from django.urls import get_resolver
from rest_framework.decorators import api_view
from rest_framework.settings import api_settings
from rest_framework.views import APIView

# Endpoints that are anonymously reachable ON PURPOSE, each with the reason.
PUBLIC = {
    "auth-register": "signing up necessarily precedes having credentials",
    "auth-login": "ditto",
    "auth-google": "ditto, via a Google ID token",
    "auth-refresh": "authenticates with the refresh cookie, not a bearer token",
    "auth-logout": "must succeed even with an expired/absent token",
    "auth-otp-request": "password reset is for people who cannot log in",
    "auth-otp-verify": "ditto",
    "auth-password-reset": "ditto",
    "product-list": "public catalog — landing page and FastAPI search read it anonymously",
    "product-detail": "public catalog",
    "category-list": "public catalog",
    "category-detail": "public catalog",
    "razorpay-webhook": "server-to-server; the real gate is the HMAC signature check",
}


def _permission_names(callback):  # the permission classes DRF will actually apply
    cls = getattr(callback, "cls", None)  # APIView.as_view() / ViewSet.as_view()
    if cls is not None and issubclass(cls, APIView):
        perms = cls.permission_classes
    elif hasattr(callback, "initkwargs"):
        perms = callback.initkwargs.get("permission_classes", api_settings.DEFAULT_PERMISSION_CLASSES)
    else:
        return None  # not a DRF view (admin, static, …)
    return {p.__name__ for p in perms}


def _drf_routes():
    for pattern in get_resolver().url_patterns:
        yield from _walk(pattern, "")


def _walk(pattern, prefix):
    from django.urls.resolvers import URLPattern, URLResolver

    if isinstance(pattern, URLResolver):
        for sub in pattern.url_patterns:
            yield from _walk(sub, prefix + str(pattern.pattern))
    elif isinstance(pattern, URLPattern):
        yield prefix + str(pattern.pattern), pattern.name, pattern.callback


class UrlPermissionTests(SimpleTestCase):
    def test_only_the_expected_endpoints_are_public(self):
        actually_public = {}
        for path, name, callback in _drf_routes():
            perms = _permission_names(callback)
            if perms is None or "AllowAny" not in perms:
                continue
            # DRF router API-root views are generated, not ours, and carry no data.
            if callback.__name__ == "APIRootView":
                continue
            actually_public[name or path] = path

        unexpected = set(actually_public) - set(PUBLIC)
        self.assertFalse(
            unexpected,
            "These endpoints are anonymously reachable but not in PUBLIC. If that is "
            "intended, add them to PUBLIC with the reason; if not, they are leaking: "
            f"{ {k: actually_public[k] for k in unexpected} }",
        )

        stale = set(PUBLIC) - set(actually_public)  # entry no longer exists — PUBLIC is stale
        self.assertFalse(stale, f"PUBLIC lists endpoints that are no longer public: {stale}")

    def test_default_permission_is_fail_closed(self):
        self.assertEqual(
            [p.__name__ for p in api_settings.DEFAULT_PERMISSION_CLASSES],
            ["IsAuthenticated"],
            "The DRF default must stay fail-closed so a view that forgets "
            "permission_classes is private, not public.",
        )
