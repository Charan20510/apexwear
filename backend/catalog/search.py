"""Builds the search_vector expression. One place so the signal, the backfill
migration, and the Django ?q= fallback all rank the same way.

QuerySet.update() forbids joined field references (Django raises FieldError for
e.g. SearchVector("category__name")), so both the category name and the variant
colours are routed through Subquery rather than a direct relation lookup.
"""

from django.contrib.postgres.aggregates import StringAgg
from django.contrib.postgres.search import SearchVector
from django.db.models import CharField, OuterRef, Subquery, Value
from django.db.models.functions import Coalesce


def product_search_vector(product_model, category_model, variant_model):
    """Models are passed in so a historical migration model works the same as the
    live one."""
    category_name = Subquery(
        category_model.objects.filter(pk=OuterRef("category_id")).values("name")[:1]
    )
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
