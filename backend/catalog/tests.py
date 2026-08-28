# Catalog model, product API, and search-vector tests.

from decimal import Decimal

from django.db import IntegrityError, transaction
from django.test import TestCase
from django.urls import reverse

from .models import Category, Product, Variant


class CatalogModelTests(TestCase):
    def setUp(self):
        self.category = Category.objects.create(name="Oversized", slug="oversized")
        self.product = Product.objects.create(
            name="Test Hoodie", slug="test-hoodie", category=self.category, base_price=Decimal("1799.00")
        )

    def test_variant_price_falls_back_to_product_base_price(self):
        variant = Variant.objects.create(
            product=self.product, size="M", colour="Black", sku="TEST-BLA-M", stock=5
        )
        self.assertEqual(variant.price, Decimal("1799.00"))

    def test_variant_price_override_wins(self):
        variant = Variant.objects.create(
            product=self.product,
            size="L",
            colour="Black",
            sku="TEST-BLA-L",
            price_override=Decimal("1499.00"),
            stock=5,
        )
        self.assertEqual(variant.price, Decimal("1499.00"))

    def test_duplicate_size_colour_for_one_product_is_rejected(self):
        Variant.objects.create(
            product=self.product, size="M", colour="Black", sku="TEST-BLA-M", stock=5
        )
        with self.assertRaises(IntegrityError), transaction.atomic():
            Variant.objects.create(
                product=self.product, size="M", colour="Black", sku="TEST-BLA-M-DUP", stock=5
            )

    def test_prices_are_decimals_not_floats(self):
        self.product.refresh_from_db()
        self.assertIsInstance(self.product.base_price, Decimal)


class ProductApiTests(TestCase):
    def setUp(self):
        self.category = Category.objects.create(name="Essential", slug="essential")
        self.active = Product.objects.create(
            name="Active Hoodie", slug="active-hoodie", category=self.category, base_price=Decimal("1299.00")
        )
        self.inactive = Product.objects.create(
            name="Hidden Hoodie",
            slug="hidden-hoodie",
            category=self.category,
            base_price=Decimal("999.00"),
            is_active=False,
        )
        Variant.objects.create(
            product=self.active, size="M", colour="Black", sku="ACTIVE-BLA-M", stock=7
        )

    def test_list_returns_only_active_products(self):
        res = self.client.get(reverse("product-list"))
        self.assertEqual(res.status_code, 200)
        slugs = [p["slug"] for p in res.json()["results"]]
        self.assertIn("active-hoodie", slugs)
        self.assertNotIn("hidden-hoodie", slugs)

    def test_detail_by_slug_includes_variants_and_stock(self):
        res = self.client.get(reverse("product-detail", args=["active-hoodie"]))
        self.assertEqual(res.status_code, 200)
        body = res.json()
        self.assertEqual(body["name"], "Active Hoodie")
        self.assertEqual(len(body["variants"]), 1)
        self.assertEqual(body["variants"][0]["stock"], 7)
        self.assertEqual(body["category"]["slug"], "essential")

    def test_inactive_product_detail_is_404(self):
        res = self.client.get(reverse("product-detail", args=["hidden-hoodie"]))
        self.assertEqual(res.status_code, 404)

    def test_unknown_slug_is_404(self):
        self.assertEqual(
            self.client.get(reverse("product-detail", args=["nope"])).status_code, 404
        )

    def test_catalog_is_public(self):
        self.assertEqual(self.client.get(reverse("product-list")).status_code, 200)


class SearchVectorTests(TestCase):
    # search_vector is populated by a signal (catalog/signals.py) — tested against the DB directly.

    def setUp(self):
        self.category = Category.objects.create(name="Oversized", slug="oversized")

    def test_search_vector_populated_on_save(self):
        product = Product.objects.create(
            name="Midnight Oversized Hoodie",
            slug="midnight-oversized-hoodie",
            category=self.category,
            base_price=Decimal("1799.00"),
        )
        product.refresh_from_db()
        self.assertIsNotNone(product.search_vector)

    def test_colour_only_on_variant_is_still_searchable(self):
        from django.contrib.postgres.search import SearchQuery

        product = Product.objects.create(
            name="Storm Blue Oversized Hoodie",
            slug="storm-blue-oversized-hoodie",
            category=self.category,
            base_price=Decimal("1899.00"),
        )
        Variant.objects.create(
            product=product, size="M", colour="Black", sku="STORM-BLA-M", stock=5
        )
        found = Product.objects.filter(
            search_vector=SearchQuery("black oversized", search_type="websearch")
        ).first()
        self.assertEqual(found, product)

    def test_variant_delete_refreshes_vector(self):
        from django.contrib.postgres.search import SearchQuery

        product = Product.objects.create(
            name="Test Hoodie",
            slug="search-test-hoodie",
            category=self.category,
            base_price=Decimal("1799.00"),
        )
        variant = Variant.objects.create(
            product=product, size="M", colour="Fuchsia", sku="SRCH-FUC-M", stock=5
        )
        variant.delete()
        found = Product.objects.filter(
            search_vector=SearchQuery("fuchsia", search_type="websearch")
        ).first()
        self.assertIsNone(found)

    def test_django_fallback_q_param_matches_search_vector(self):
        product = Product.objects.create(
            name="Maroon Zip-Up Hoodie",
            slug="maroon-zip-up-hoodie",
            category=self.category,
            base_price=Decimal("2299.00"),
        )
        res = self.client.get(reverse("product-list"), {"q": "maroon"})
        self.assertEqual(res.status_code, 200)
        slugs = [p["slug"] for p in res.json()["results"]]
        self.assertIn(product.slug, slugs)
