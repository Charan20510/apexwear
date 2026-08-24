from django.contrib.postgres.search import SearchQuery
from rest_framework import viewsets

from .models import Category, Product
from .serializers import CategorySerializer, ProductDetailSerializer, ProductListSerializer


class ProductViewSet(viewsets.ReadOnlyModelViewSet):
    """Also the Phase-2 fallback: if FastAPI (/search/*) is unreachable, the
    frontend calls here instead. ?q= reuses the same search_vector FastAPI ranks
    on, so results are consistent even though there's no facet/price filtering
    here — that's the deliberate ceiling; see plan.md Phase 2."""

    lookup_field = "slug"

    def get_object(self):
        # /shop/hoodie/<id> resolves by id too, so the frontend can redirect it to
        # the canonical slug URL instead of 404ing.
        lookup_value = self.kwargs.get(self.lookup_url_kwarg or self.lookup_field)
        if lookup_value and lookup_value.isdigit():
            obj = self.filter_queryset(self.get_queryset()).filter(pk=lookup_value).first()
            if obj is not None:
                self.check_object_permissions(self.request, obj)
                return obj
        return super().get_object()

    def get_queryset(self):
        # variants are only rendered by ProductDetailSerializer (self.action == "retrieve"),
        # so the list action skips prefetching them.
        related = ["images", "variants"] if self.action == "retrieve" else ["images"]
        qs = Product.objects.filter(is_active=True).select_related("category").prefetch_related(*related)
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
    lookup_field = "slug"
    queryset = Category.objects.all()
    serializer_class = CategorySerializer
