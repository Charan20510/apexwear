from django.db import migrations

# Placeholder values for the 6 pre-existing rows so 0004 can safely make these
# fields required + unique. Real registrations always supply their own values;
# this migration only ever touches rows that predate the fields existing.
PLACEHOLDER_MOBILE_BASE = 9000000000
PLACEHOLDER_DOB = "1990-01-01"


def backfill(apps, schema_editor):
    User = apps.get_model("accounts", "User")
    for index, user in enumerate(User.objects.order_by("id"), start=1):
        changed = False
        if not user.mobile:
            user.mobile = str(PLACEHOLDER_MOBILE_BASE + index)
            changed = True
        if not user.date_of_birth:
            user.date_of_birth = PLACEHOLDER_DOB
            changed = True
        if not user.gender:
            user.gender = "other"
            changed = True
        if not user.first_name:
            user.first_name = "Customer"
            changed = True
        if changed:
            user.save(update_fields=["mobile", "date_of_birth", "gender", "first_name"])


def noop_reverse(apps, schema_editor):
    # Nothing to undo — these were missing values, not real data.
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0002_user_profile_fields"),
    ]

    operations = [
        migrations.RunPython(backfill, noop_reverse),
    ]
