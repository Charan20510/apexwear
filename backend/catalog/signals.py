from django.db.models.signals import post_delete, post_save
from django.dispatch import receiver

from .models import Category, Product, Variant
from .search import refresh_search_vectors


def _refresh(product_id):
    # .update() doesn't re-fire post_save, so this can't recurse.
    refresh_search_vectors(Product.objects.filter(pk=product_id), Product, Category, Variant)


@receiver(post_save, sender=Product)
def product_saved(sender, instance, **kwargs):
    _refresh(instance.pk)


@receiver(post_save, sender=Variant)
@receiver(post_delete, sender=Variant)
def variant_changed(sender, instance, **kwargs):
    _refresh(instance.product_id)
