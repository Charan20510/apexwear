# Reassigns 900000000X placeholder mobiles (from 0003) to the '0'-prefixed convention, so they can't collide with a real number.

import secrets

from django.db import migrations

AFFECTED_PREFIX = "900000000"  # the block 0003 assigned: PLACEHOLDER_MOBILE_BASE = 9000000000, + index


def _placeholder():  # inlined copy of accounts.models.random_placeholder_mobile — migrations can't import live code
    return "0" + "".join(str(secrets.randbelow(10)) for _ in range(9))


def repair(apps, schema_editor):
    User = apps.get_model("accounts", "User")
    taken = set(User.objects.values_list("mobile", flat=True))
    for user in User.objects.filter(mobile__startswith=AFFECTED_PREFIX):
        if len(user.mobile) != 10:
            continue
        new = _placeholder()
        while new in taken:
            new = _placeholder()
        taken.add(new)
        taken.discard(user.mobile)
        user.mobile = new
        user.save(update_fields=["mobile"])


def noop_reverse(apps, schema_editor):  # not reversible — the original numbers were themselves wrong
    pass


class Migration(migrations.Migration):
    dependencies = [("accounts", "0005_address_one_default_address_per_user")]

    operations = [migrations.RunPython(repair, noop_reverse)]
