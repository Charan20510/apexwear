from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("catalog", "0002_backfill_search_vector"),
    ]

    operations = [
        migrations.AddField(
            model_name="product",
            name="mrp",
            field=models.DecimalField(blank=True, decimal_places=2, max_digits=10, null=True),
        ),
    ]
