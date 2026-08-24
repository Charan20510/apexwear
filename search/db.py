"""Read-only Postgres engine for FastAPI. Connects as the `search_ro` role
(backend/sql/search_ro.sql) — SELECT only, enforced by the database, not by this
code. Never construct an engine here with any other role.
"""

import os
from urllib.parse import urlparse

import dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
dotenv.load_dotenv(os.path.join(_ROOT, ".env"))

# Reuses DATABASE_URL's host/port/db (same database Django writes to) but swaps in
# the read-only role — never Django's own DB user.
_django_url = urlparse(os.environ.get("DATABASE_URL", "postgres://localhost:5432/apexwear"))
_search_ro_password = os.environ.get("SEARCH_RO_PASSWORD", "search_ro")

SEARCH_DATABASE_URL = (
    f"postgresql+psycopg://search_ro:{_search_ro_password}"
    f"@{_django_url.hostname or 'localhost'}:{_django_url.port or 5432}"
    f"/{_django_url.path.lstrip('/') or 'apexwear'}"
)

engine = create_engine(SEARCH_DATABASE_URL, pool_pre_ping=True)


def get_session():
    with Session(engine) as session:
        yield session
