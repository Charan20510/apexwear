# Verifies Django's JWT (same signing key/algorithm) — never issues one.

import os

import dotenv
import jwt
from fastapi import Header

_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
dotenv.load_dotenv(os.path.join(_ROOT, ".env"))

_DEV_SIGNING_KEY = "django-insecure-dev-key"
_SIGNING_KEY = os.environ.get("DJANGO_SECRET_KEY", _DEV_SIGNING_KEY)

# Mirrors settings.py — refuse to verify against the shared dev key outside DEBUG.
if _SIGNING_KEY == _DEV_SIGNING_KEY and os.environ.get("DEBUG", "False") != "True":
    raise RuntimeError(
        "DJANGO_SECRET_KEY must be set when DEBUG is off — refusing to verify JWTs "
        "with the dev key."
    )


def optional_user(authorization: str | None = Header(default=None)) -> int | None:
    # Returns the user id from a Bearer token, or None — never raises.
    if not authorization or not authorization.startswith("Bearer "):
        return None
    token = authorization.removeprefix("Bearer ")
    try:
        payload = jwt.decode(token, _SIGNING_KEY, algorithms=["HS256"])
    except jwt.PyJWTError:
        return None
    return payload.get("user_id")
