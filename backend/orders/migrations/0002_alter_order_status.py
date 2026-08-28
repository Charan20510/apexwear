from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('orders', '0001_initial'),
    ]

    operations = [
        migrations.AlterField(
            model_name='order',
            name='status',
            field=models.CharField(choices=[('pending', 'Pending'), ('paid', 'Paid'), ('confirmed', 'Confirmed'), ('failed', 'Failed'), ('cancelled', 'Cancelled'), ('awaiting_refund', 'Awaiting refund')], default='pending', max_length=20),
        ),
    ]
