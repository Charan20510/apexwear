import django.core.validators
from django.db import migrations, models
from django.db.models.functions import Lower


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0003_backfill_user_profile"),
    ]

    operations = [
        migrations.AlterField(
            model_name="user",
            name="first_name",
            field=models.CharField(max_length=150),
        ),
        migrations.AlterField(
            model_name="user",
            name="date_of_birth",
            field=models.DateField(),
        ),
        migrations.AlterField(
            model_name="user",
            name="gender",
            field=models.CharField(
                choices=[("male", "Male"), ("female", "Female"), ("other", "Other")],
                max_length=6,
            ),
        ),
        migrations.AlterField(
            model_name="user",
            name="mobile",
            field=models.CharField(
                max_length=10,
                unique=True,
                validators=[
                    django.core.validators.RegexValidator(
                        "^\\d{10}$", "Mobile number must be exactly 10 digits."
                    )
                ],
            ),
        ),
        migrations.RemoveField(
            model_name="user",
            name="phone",
        ),
        migrations.AddConstraint(
            model_name="user",
            constraint=models.UniqueConstraint(Lower("email"), name="user_email_ci_unique"),
        ),
    ]
