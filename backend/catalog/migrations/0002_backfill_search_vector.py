from django.db import migrations

from catalog.search import refresh_search_vectors


def backfill(apps, schema_editor):
    Product = apps.get_model("catalog", "Product")
    Category = apps.get_model("catalog", "Category")
    Variant = apps.get_model("catalog", "Variant")
    refresh_search_vectors(Product.objects.all(), Product, Category, Variant)


class Migration(migrations.Migration):
    dependencies = [
        ("catalog", "0001_initial"),
    ]

    operations = [
        migrations.RunPython(backfill, migrations.RunPython.noop),
    ]
