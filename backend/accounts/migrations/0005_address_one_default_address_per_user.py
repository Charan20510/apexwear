from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0004_user_profile_required'),
    ]

    operations = [
        migrations.AddConstraint(
            model_name='address',
            constraint=models.UniqueConstraint(condition=models.Q(('is_default', True)), fields=('user',), name='one_default_address_per_user'),
        ),
    ]
