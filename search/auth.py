"""Verifies Django's JWT — never issues one. Same signing key, same algorithm
(simplejwt defaults to HS256 with SECRET_KEY when SIGNING_KEY isn't set — see
backend/apexwear/settings.py SIMPLE_JWT). Search itself is public; this exists so
a future recommendations endpoint can personalise for a logged-in user without a
second login system.
"""

import os

import dotenv
import jwt
from fastapi import Header

_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
dotenv.load_dotenv(os.path.join(_ROOT, ".env"))

_DEV_SIGNING_KEY = "django-insecure-dev-key"
_SIGNING_KEY = os.environ.get("DJANGO_SECRET_KEY", _DEV_SIGNING_KEY)

# Mirrors backend/apexwear/settings.py: refuse to verify tokens against the shared dev
# key outside DEBUG. Without this, a search service started with no DJANGO_SECRET_KEY
# would happily accept tokens anyone could forge with a publicly-known key.
if _SIGNING_KEY == _DEV_SIGNING_KEY and os.environ.get("DEBUG", "False") != "True":
    raise RuntimeError(
        "DJANGO_SECRET_KEY must be set when DEBUG is off — refusing to verify JWTs "
        "with the dev key."
    )


def optional_user(authorization: str | None = Header(default=None)) -> int | None:
    """Returns the user id from a Bearer token if present and valid, else None.
    Never raises — an invalid/missing token just means an anonymous request."""
    if not authorization or not authorization.startswith("Bearer "):
        return None
    token = authorization.removeprefix("Bearer ")
    try:
        payload = jwt.decode(token, _SIGNING_KEY, algorithms=["HS256"])
    except jwt.PyJWTError:
        return None
    return payload.get("user_id")
