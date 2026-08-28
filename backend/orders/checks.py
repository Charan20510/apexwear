# Startup checks that surface Razorpay misconfiguration at `check`/`runserver` time.

from django.conf import settings
from django.core.checks import Warning, register

URL_PREFIXES = ("http://", "https://")  # the webhook secret is never a URL


@register()
def razorpay_config(app_configs, **kwargs):
    problems = []
    key_id = settings.RAZORPAY_KEY_ID
    secret = settings.RAZORPAY_KEY_SECRET
    webhook_secret = settings.RAZORPAY_WEBHOOK_SECRET

    if webhook_secret.startswith(URL_PREFIXES):
        problems.append(
            # Warning, not Error — an Error would stop the whole store over an optional setting.
            Warning(
                "RAZORPAY_WEBHOOK_SECRET is a URL, not a secret.",
                hint=(
                    "You've pasted the webhook *endpoint* (your ngrok/public URL) into the "
                    "secret field. The secret is the string you type into the 'Secret' box "
                    "on Razorpay Dashboard > Settings > Webhooks. Every webhook will fail "
                    "signature verification until this is fixed, so payments will succeed "
                    "in the browser while orders stay PENDING."
                ),
                id="orders.W003",
            )
        )

    configured = [bool(key_id), bool(secret), bool(webhook_secret)]
    if any(configured) and not all(configured):  # all-blank is the documented "disabled" state
        missing = [
            name
            for name, present in zip(
                ("RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET", "RAZORPAY_WEBHOOK_SECRET"), configured
            )
            if not present
        ]
        problems.append(
            Warning(
                f"Razorpay is partially configured — missing: {', '.join(missing)}.",
                hint=(
                    "Set all three or leave all three blank. Blank disables online payment "
                    "cleanly (checkout returns 503 and COD keeps working); a partial config "
                    "fails later, mid-checkout."
                ),
                id="orders.W001",
            )
        )

    if key_id and not key_id.startswith(("rzp_test_", "rzp_live_")):
        problems.append(
            Warning(
                "RAZORPAY_KEY_ID does not look like a Razorpay key id.",
                hint="Expected it to start with 'rzp_test_' or 'rzp_live_'.",
                id="orders.W002",
            )
        )

    return problems
