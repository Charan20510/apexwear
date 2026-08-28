# Product/category read endpoints — also the fallback when FastAPI search is down.

from django.contrib.postgres.search import SearchQuery
from django.db.models import Exists, OuterRef, Prefetch
from rest_framework import permissions, viewsets

from .models import Category, Product, Variant
from .serializers import CategorySerializer, ProductDetailSerializer, ProductListSerializer


class ProductViewSet(viewsets.ReadOnlyModelViewSet):
    permission_classes = [permissions.AllowAny]  # public catalog, no security boundary here
    lookup_field = "slug"

    def get_object(self):
        # /shop/hoodie/<id> resolves by id too, so it can redirect to the canonical slug.
        lookup_value = self.kwargs.get(self.lookup_url_kwarg or self.lookup_field)
        if lookup_value and lookup_value.isdigit():
            obj = self.filter_queryset(self.get_queryset()).filter(pk=lookup_value).first()
            if obj is not None:
                self.check_object_permissions(self.request, obj)
                return obj
        return super().get_object()

    def get_queryset(self):
        # select_related on the variants prefetch: Variant.price falls back to
        # product.base_price, and a plain prefetch doesn't populate that reverse cache.
        related = (
            ["images", Prefetch("variants", queryset=Variant.objects.select_related("product"))]
            if self.action == "retrieve"
            else ["images"]
        )
        qs = (
            Product.objects.filter(is_active=True)
            .select_related("category")
            .prefetch_related(*related)
            .annotate(  # annotated, not a property — a property would run one query per card
                in_stock=Exists(Variant.objects.filter(product=OuterRef("pk"), stock__gt=0))
            )
        )
        q = self.request.query_params.get("q")
        if q:
            qs = qs.filter(search_vector=SearchQuery(q, search_type="websearch"))
        category = self.request.query_params.get("category")
        if category:
            qs = qs.filter(category__slug=category)
        ordering = self.request.query_params.get("ordering")
        if ordering in ("base_price", "-base_price", "-created_at"):
            qs = qs.order_by(ordering)
        return qs

    def get_serializer_class(self):
        if self.action == "retrieve":
            return ProductDetailSerializer
        return ProductListSerializer


class CategoryViewSet(viewsets.ReadOnlyModelViewSet):
    permission_classes = [permissions.AllowAny]
    lookup_field = "slug"
    queryset = Category.objects.all()
    serializer_class = CategorySerializer
