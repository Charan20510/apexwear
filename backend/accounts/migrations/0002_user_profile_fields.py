import django.core.validators
import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="user",
            name="date_of_birth",
            field=models.DateField(null=True),
        ),
        migrations.AddField(
            model_name="user",
            name="gender",
            field=models.CharField(
                choices=[("male", "Male"), ("female", "Female"), ("other", "Other")],
                max_length=6,
                null=True,
            ),
        ),
        migrations.AddField(
            model_name="user",
            name="mobile",
            field=models.CharField(
                max_length=10,
                null=True,
                unique=True,
                validators=[
                    django.core.validators.RegexValidator(
                        "^\\d{10}$", "Mobile number must be exactly 10 digits."
                    )
                ],
            ),
        ),
        migrations.CreateModel(
            name="PasswordResetOTP",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True, primary_key=True, serialize=False, verbose_name="ID"
                    ),
                ),
                ("code_hash", models.CharField(max_length=128)),
                ("token_hash", models.CharField(blank=True, max_length=128)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("expires_at", models.DateTimeField()),
                ("attempts", models.PositiveSmallIntegerField(default=0)),
                ("consumed_at", models.DateTimeField(blank=True, null=True)),
                (
                    "user",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="reset_otps",
                        to="accounts.user",
                    ),
                ),
            ],
        ),
        migrations.AddIndex(
            model_name="passwordresetotp",
            index=models.Index(fields=["user", "created_at"], name="accounts_pa_user_id_c7ab27_idx"),
        ),
    ]
