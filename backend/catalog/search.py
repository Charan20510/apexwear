# Builds search_vector — shared by the signal, backfill migration, and Django's ?q= fallback.

from django.contrib.postgres.aggregates import StringAgg
from django.contrib.postgres.search import SearchVector
from django.db.models import CharField, OuterRef, Subquery, Value
from django.db.models.functions import Coalesce


def product_search_vector(product_model, category_model, variant_model):
    # Models passed in so a historical migration model works the same as the live one.
    category_name = Subquery(
        category_model.objects.filter(pk=OuterRef("category_id")).values("name")[:1]
    )
    # Subquery, not a direct relation lookup — QuerySet.update() forbids joined field refs.
    colours = Subquery(
        variant_model.objects.filter(product=OuterRef("pk"))
        .order_by()
        .values("product")
        .annotate(colours=StringAgg("colour", delimiter=" ", distinct=True))
        .values("colours")
    )
    return (
        SearchVector("name", weight="A")
        + SearchVector(
            Coalesce(category_name, Value(""), output_field=CharField()), weight="B"
        )
        + SearchVector("description", weight="C")
        + SearchVector(Coalesce(colours, Value(""), output_field=CharField()), weight="D")
    )


def refresh_search_vectors(queryset, product_model, category_model, variant_model):
    queryset.update(
        search_vector=product_search_vector(product_model, category_model, variant_model)
    )
