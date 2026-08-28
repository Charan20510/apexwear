# Read-only search service (search_ro role, see search/db.py). /search/products
# mirrors DRF's paginator shape so the Django fallback is a URL swap, not a new parser.

import os
from typing import Literal

from fastapi import Depends, FastAPI, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import exists, func, select
from sqlalchemy.orm import Session, selectinload

from .auth import optional_user
from .db import get_session
from .models import Category, Product, Variant

app = FastAPI(title="apexwear search")

app.add_middleware(  # permissive CORS so the service is also directly curl/browser-testable
    CORSMiddleware, allow_origins=["*"], allow_methods=["GET"], allow_headers=["*"]
)

DJANGO_BASE_URL = f"http://localhost:{os.environ.get('DJANGO_PORT', '8000')}"
PAGE_SIZE_DEFAULT = 24


def _image_url(product: Product) -> str | None:
    if not product.images:
        return None
    return f"{DJANGO_BASE_URL}/media/{product.images[0].image}"


def _serialize(product: Product) -> dict:
    return {
        "id": product.id,
        "name": product.name,
        "slug": product.slug,
        "category": product.category.name,
        "base_price": f"{product.base_price:.2f}",
        "mrp": f"{product.mrp:.2f}" if product.mrp is not None else None,
        "image": _image_url(product),
        "in_stock": any(v.stock > 0 for v in product.variants),  # mirrors ProductViewSet's annotation
    }


def _apply_filters(
    stmt,
    q: str | None,
    category: str | None,
    size: str | None,
    colour: str | None,
    min_price: float | None,
    max_price: float | None,
):
    stmt = stmt.where(Product.is_active.is_(True))
    if q:
        tsquery = func.websearch_to_tsquery("english", q)
        stmt = stmt.where(Product.search_vector.op("@@")(tsquery))
    if category:
        stmt = stmt.where(Product.category.has(Category.slug == category))
    if size:
        stmt = stmt.where(
            exists().where(Variant.product_id == Product.id, Variant.size == size)
        )
    if colour:
        stmt = stmt.where(
            exists().where(Variant.product_id == Product.id, Variant.colour == colour)
        )
    if min_price is not None:
        stmt = stmt.where(Product.base_price >= min_price)
    if max_price is not None:
        stmt = stmt.where(Product.base_price <= max_price)
    return stmt


@app.get("/search/health")
def health():
    return {"status": "ok"}


@app.get("/search/products")
def search_products(
    request: Request,
    q: str | None = None,
    category: str | None = None,
    size: str | None = None,
    colour: str | None = None,
    min_price: float | None = None,
    max_price: float | None = None,
    sort: Literal["relevance", "price", "-price", "newest"] = "relevance",
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=PAGE_SIZE_DEFAULT, ge=1, le=100),
    session: Session = Depends(get_session),
    _user_id: int | None = Depends(optional_user),
):
    base = _apply_filters(
        select(Product), q, category, size, colour, min_price, max_price
    )

    count = session.scalar(select(func.count()).select_from(base.subquery()))

    stmt = base
    if sort == "price":
        stmt = stmt.order_by(Product.base_price.asc())
    elif sort == "-price":
        stmt = stmt.order_by(Product.base_price.desc())
    elif sort == "newest":
        stmt = stmt.order_by(Product.created_at.desc())
    elif q:
        tsquery = func.websearch_to_tsquery("english", q)
        stmt = stmt.order_by(func.ts_rank(Product.search_vector, tsquery).desc())
    else:
        stmt = stmt.order_by(Product.created_at.desc())

    offset = (page - 1) * page_size
    stmt = stmt.offset(offset).limit(page_size).options(
        selectinload(Product.category),
        selectinload(Product.images),
        selectinload(Product.variants),  # _serialize reads stock off every variant
    )
    products = session.scalars(stmt).unique().all()

    base_url = str(request.url.remove_query_params("page"))
    sep = "&" if "?" in base_url else "?"
    has_next = offset + page_size < (count or 0)
    has_prev = page > 1
    next_url = f"{base_url}{sep}page={page + 1}" if has_next else None
    prev_url = f"{base_url}{sep}page={page - 1}" if has_prev else None

    return {
        "count": count or 0,
        "next": next_url,
        "previous": prev_url,
        "results": [_serialize(p) for p in products],
    }


@app.get("/search/facets")
def search_facets(
    q: str | None = None,
    category: str | None = None,
    min_price: float | None = None,
    max_price: float | None = None,
    session: Session = Depends(get_session),
):
    # size/colour excluded from their own facet filter — every size stays visible after picking a colour.
    ids_stmt = _apply_filters(
        select(Product.id), q, category, None, None, min_price, max_price
    ).subquery()

    sizes = session.scalars(
        select(Variant.size).join(ids_stmt, Variant.product_id == ids_stmt.c.id).distinct()
    ).all()
    colours = session.scalars(
        select(Variant.colour).join(ids_stmt, Variant.product_id == ids_stmt.c.id).distinct()
    ).all()
    categories = session.scalars(
        select(Category.slug)
        .join(Product, Product.category_id == Category.id)
        .where(Product.id.in_(select(ids_stmt.c.id)))
        .distinct()
    ).all()
    price_range = session.execute(
        select(func.min(Product.base_price), func.max(Product.base_price)).where(
            Product.id.in_(select(ids_stmt.c.id))
        )
    ).one()

    return {
        "sizes": sorted(sizes),
        "colours": sorted(colours),
        "categories": sorted(categories),
        "min_price": price_range[0],
        "max_price": price_range[1],
    }
