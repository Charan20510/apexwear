"""Hand-written read mappings of Django's catalog tables (backend/catalog/models.py).
No Alembic, no metadata.create_all — Django owns every migration; this just
describes the columns that already exist so SQLAlchemy can SELECT them.
"""

from datetime import datetime

from sqlalchemy import ForeignKey
from sqlalchemy.dialects.postgresql import TSVECTOR
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class Category(Base):
    __tablename__ = "catalog_category"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str]
    slug: Mapped[str]
    parent_id: Mapped[int | None] = mapped_column(ForeignKey("catalog_category.id"))


class Product(Base):
    __tablename__ = "catalog_product"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str]
    slug: Mapped[str]
    description: Mapped[str]
    base_price: Mapped[float]
    mrp: Mapped[float | None]
    is_active: Mapped[bool]
    created_at: Mapped[datetime]
    category_id: Mapped[int] = mapped_column(ForeignKey("catalog_category.id"))
    search_vector: Mapped[str | None] = mapped_column(TSVECTOR)

    category: Mapped["Category"] = relationship()
    images: Mapped[list["ProductImage"]] = relationship(order_by="ProductImage.position")
    variants: Mapped[list["Variant"]] = relationship()


class ProductImage(Base):
    __tablename__ = "catalog_productimage"

    id: Mapped[int] = mapped_column(primary_key=True)
    image: Mapped[str]
    alt: Mapped[str]
    position: Mapped[int]
    product_id: Mapped[int] = mapped_column(ForeignKey("catalog_product.id"))


class Variant(Base):
    __tablename__ = "catalog_variant"

    id: Mapped[int] = mapped_column(primary_key=True)
    size: Mapped[str]
    colour: Mapped[str]
    sku: Mapped[str]
    price_override: Mapped[float | None]
    stock: Mapped[int]
    product_id: Mapped[int] = mapped_column(ForeignKey("catalog_product.id"))
