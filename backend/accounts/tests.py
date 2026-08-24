from datetime import timedelta
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.exceptions import FieldDoesNotExist
from django.test import TestCase, override_settings
from django.urls import reverse
from django.utils import timezone

from .models import PasswordResetOTP
from .views import REFRESH_COOKIE

User = get_user_model()


def registration_payload(**overrides):
    payload = {
        "email": "new@apexwear.test",
        "password": "Sunburn-Hoodie91",
        "confirm_password": "Sunburn-Hoodie91",
        "first_name": "New",
        "date_of_birth": "1995-06-15",
        "mobile": "9876543210",
        "gender": "male",
    }
    payload.update(overrides)
    return payload


def make_user(**overrides):
    defaults = {
        "email": "user@apexwear.test",
        "password": "Sunburn-Hoodie91",
        "first_name": "User",
        "date_of_birth": "1995-06-15",
        "mobile": "9123456789",
        "gender": "female",
    }
    defaults.update(overrides)
    return User.objects.create_user(**defaults)


class EmailOnlyUserTests(TestCase):
    """Locks in the email-as-login decision. There must be no username, ever —
    changing AUTH_USER_MODEL after Phase 1 means dropping the database."""

    def test_user_model_has_no_username_field(self):
        with self.assertRaises(FieldDoesNotExist):
            User._meta.get_field("username")

    def test_email_is_the_login_field(self):
        self.assertEqual(User.USERNAME_FIELD, "email")
        self.assertEqual(User.REQUIRED_FIELDS, [])

    def test_create_user_requires_an_email(self):
        with self.assertRaises(ValueError):
            User.objects.create_user(email="", password="Sunburn-Hoodie91")

    def test_create_user_normalises_the_whole_email(self):
        user = make_user(email="Person@EXAMPLE.COM", mobile="9111111111")
        self.assertEqual(user.email, "person@example.com")

    def test_create_superuser_with_email_alone(self):
        # createsuperuser only ever prompts for USERNAME_FIELD + REQUIRED_FIELDS
        # (both just email), so the manager must supply sane defaults for
        # everything else — this locks that in.
        admin = User.objects.create_superuser(email="boss@apexwear.test", password="Sunburn-Hoodie91")
        self.assertTrue(admin.is_staff)
        self.assertTrue(admin.is_superuser)
        self.assertEqual(admin.email, "boss@apexwear.test")


class RegisterTests(TestCase):
    def register(self, **overrides):
        return self.client.post(
            reverse("auth-register"),
            registration_payload(**overrides),
            content_type="application/json",
        )

    def test_register_returns_access_token_and_sets_refresh_cookie(self):
        res = self.register()
        self.assertEqual(res.status_code, 201)
        self.assertIn("access", res.json())
        self.assertEqual(res.json()["user"]["email"], "new@apexwear.test")

        cookie = res.cookies[REFRESH_COOKIE]
        self.assertTrue(cookie["httponly"])
        self.assertEqual(cookie["path"], "/api/auth")
        # The refresh token must never be readable from the JSON body.
        self.assertNotIn("refresh", res.json())

    def test_duplicate_email_is_rejected_with_a_named_conflict(self):
        make_user(email="dupe@apexwear.test", mobile="9111111111")
        res = self.register(email="dupe@apexwear.test", mobile="9876543210")
        self.assertEqual(res.status_code, 409)
        self.assertEqual(res.json()["conflicts"], ["email"])

    def test_duplicate_email_is_case_insensitive(self):
        make_user(email="dupe@apexwear.test", mobile="9111111111")
        res = self.register(email="DUPE@apexwear.test", mobile="9876543210")
        self.assertEqual(res.status_code, 409)
        self.assertEqual(res.json()["conflicts"], ["email"])

    def test_duplicate_mobile_is_rejected_with_a_named_conflict(self):
        make_user(email="other@apexwear.test", mobile="9876543210")
        res = self.register(mobile="9876543210")
        self.assertEqual(res.status_code, 409)
        self.assertEqual(res.json()["conflicts"], ["mobile"])

    def test_both_email_and_mobile_duplicate_names_both(self):
        make_user(email="new@apexwear.test", mobile="9876543210")
        res = self.register()
        self.assertEqual(res.status_code, 409)
        self.assertEqual(set(res.json()["conflicts"]), {"email", "mobile"})

    def test_short_password_is_rejected(self):
        res = self.register(password="abc", confirm_password="abc")
        self.assertEqual(res.status_code, 400)
        self.assertFalse(User.objects.filter(email="new@apexwear.test").exists())

    def test_mismatched_confirm_password_is_rejected(self):
        res = self.register(confirm_password="different1234")
        self.assertEqual(res.status_code, 400)
        self.assertFalse(User.objects.filter(email="new@apexwear.test").exists())

    def test_invalid_mobile_is_rejected(self):
        res = self.register(mobile="12345")
        self.assertEqual(res.status_code, 400)


class LoginAndSessionTests(TestCase):
    def setUp(self):
        self.password = "Sunburn-Hoodie91"
        self.user = make_user(email="user@apexwear.test", password=self.password, mobile="9123456789")

    def login(self, identifier=None):
        return self.client.post(
            reverse("auth-login"),
            {"identifier": identifier or self.user.email, "password": self.password},
            content_type="application/json",
        )

    def test_login_with_correct_password(self):
        res = self.login()
        self.assertEqual(res.status_code, 200)
        self.assertIn("access", res.json())
        self.assertNotIn("refresh", res.json())
        self.assertIn(REFRESH_COOKIE, res.cookies)

    def test_login_by_mobile_number(self):
        res = self.login(identifier="9123456789")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()["user"]["email"], self.user.email)

    def test_login_by_mobile_with_plus91_prefix(self):
        res = self.login(identifier="+91 91234 56789")
        self.assertEqual(res.status_code, 200)

    def test_login_with_wrong_password_is_rejected(self):
        res = self.client.post(
            reverse("auth-login"),
            {"identifier": self.user.email, "password": "wrong-password"},
            content_type="application/json",
        )
        self.assertEqual(res.status_code, 401)
        self.assertEqual(res.json()["detail"], "Invalid credentials")

    def test_unknown_identifier_gives_the_identical_generic_message(self):
        res = self.client.post(
            reverse("auth-login"),
            {"identifier": "nobody@apexwear.test", "password": "whatever1234"},
            content_type="application/json",
        )
        self.assertEqual(res.status_code, 401)
        self.assertEqual(res.json()["detail"], "Invalid credentials")

    def test_me_requires_a_token(self):
        self.assertEqual(self.client.get(reverse("auth-me")).status_code, 401)

    def test_me_returns_the_current_user(self):
        access = self.login().json()["access"]
        res = self.client.get(reverse("auth-me"), headers={"authorization": f"Bearer {access}"})
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()["email"], self.user.email)

    def test_refresh_issues_a_new_access_token_from_the_cookie(self):
        self.login()  # sets the cookie on self.client
        res = self.client.post(reverse("auth-refresh"))
        self.assertEqual(res.status_code, 200)
        self.assertIn("access", res.json())

    def test_refresh_without_a_cookie_is_rejected(self):
        self.assertEqual(self.client.post(reverse("auth-refresh")).status_code, 401)

    def test_refresh_with_a_garbage_cookie_is_rejected(self):
        self.client.cookies[REFRESH_COOKIE] = "not-a-real-token"
        self.assertEqual(self.client.post(reverse("auth-refresh")).status_code, 401)

    def test_logout_clears_the_cookie(self):
        self.login()
        res = self.client.post(reverse("auth-logout"))
        self.assertEqual(res.status_code, 204)
        self.assertEqual(res.cookies[REFRESH_COOKIE].value, "")


class ProfileCrudTests(TestCase):
    def setUp(self):
        self.password = "Sunburn-Hoodie91"
        self.user = make_user(email="me@apexwear.test", password=self.password, mobile="9111111111")
        self.other = make_user(email="other@apexwear.test", password=self.password, mobile="9222222222")
        access = self.client.post(
            reverse("auth-login"),
            {"identifier": self.user.email, "password": self.password},
            content_type="application/json",
        ).json()["access"]
        self.auth = {"headers": {"authorization": f"Bearer {access}"}}

    def test_get_me_requires_auth(self):
        self.assertEqual(self.client.get(reverse("auth-me")).status_code, 401)

    def test_patch_updates_profile_and_normalises_mobile(self):
        res = self.client.patch(
            reverse("auth-me"),
            {"first_name": "Updated", "mobile": "+91 93000 11122"},
            content_type="application/json",
            **self.auth,
        )
        self.assertEqual(res.status_code, 200)
        self.user.refresh_from_db()
        self.assertEqual(self.user.first_name, "Updated")
        self.assertEqual(self.user.mobile, "9300011122")

    def test_patch_cannot_steal_another_users_mobile(self):
        res = self.client.patch(
            reverse("auth-me"),
            {"mobile": self.other.mobile},
            content_type="application/json",
            **self.auth,
        )
        self.assertEqual(res.status_code, 400)

    def test_patch_ignores_email_changes(self):
        res = self.client.patch(
            reverse("auth-me"),
            {"email": "hijacked@apexwear.test"},
            content_type="application/json",
            **self.auth,
        )
        self.assertEqual(res.status_code, 200)
        self.user.refresh_from_db()
        self.assertEqual(self.user.email, "me@apexwear.test")

    def test_delete_deactivates_and_revokes_the_token(self):
        res = self.client.delete(reverse("auth-me"), **self.auth)
        self.assertEqual(res.status_code, 204)
        self.assertEqual(res.cookies[REFRESH_COOKIE].value, "")

        self.user.refresh_from_db()
        self.assertFalse(self.user.is_active)

        # The old access token must stop working immediately, not just at its
        # natural expiry.
        again = self.client.get(reverse("auth-me"), **self.auth)
        self.assertEqual(again.status_code, 401)


def google_claims(**overrides):
    claims = {
        "email": "gtest@apexwear.test",
        "email_verified": True,
        "given_name": "Given",
        "family_name": "Family",
    }
    claims.update(overrides)
    return claims


@override_settings(GOOGLE_OAUTH_CLIENT_ID="test-client-id.apps.googleusercontent.com")
class GoogleLoginTests(TestCase):
    url_name = "auth-google"

    def post(self, credential="fake-id-token"):
        return self.client.post(
            reverse(self.url_name), {"credential": credential}, content_type="application/json"
        )

    @patch("accounts.views.id_token.verify_oauth2_token")
    def test_unregistered_google_email_is_rejected(self, mock_verify):
        mock_verify.return_value = google_claims()
        res = self.post()

        self.assertEqual(res.status_code, 404)
        self.assertEqual(res.json()["code"], "not_registered")
        self.assertEqual(res.json()["email"], "gtest@apexwear.test")
        self.assertFalse(User.objects.filter(email="gtest@apexwear.test").exists())

    @patch("accounts.views.id_token.verify_oauth2_token")
    def test_existing_password_account_is_linked_not_duplicated(self, mock_verify):
        existing = make_user(email="gtest@apexwear.test", mobile="9111111111")
        mock_verify.return_value = google_claims()

        res = self.post()

        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()["user"]["id"], existing.id)
        self.assertEqual(User.objects.filter(email="gtest@apexwear.test").count(), 1)
        # Linking must not destroy the password they already had.
        existing.refresh_from_db()
        self.assertTrue(existing.has_usable_password())

    @patch("accounts.views.id_token.verify_oauth2_token")
    def test_unverified_google_email_is_rejected(self, mock_verify):
        mock_verify.return_value = google_claims(email_verified=False)
        res = self.post()
        self.assertEqual(res.status_code, 400)
        self.assertFalse(User.objects.filter(email="gtest@apexwear.test").exists())

    @patch("accounts.views.id_token.verify_oauth2_token")
    def test_token_rejected_by_google_is_unauthorised(self, mock_verify):
        mock_verify.side_effect = ValueError("bad signature")
        res = self.post()
        self.assertEqual(res.status_code, 401)
        self.assertEqual(User.objects.count(), 0)

    def test_missing_credential_is_rejected(self):
        res = self.client.post(reverse(self.url_name), {}, content_type="application/json")
        self.assertEqual(res.status_code, 400)

    @override_settings(GOOGLE_OAUTH_CLIENT_ID="")
    def test_unconfigured_server_says_so_clearly(self):
        self.assertEqual(self.post().status_code, 503)


@override_settings(DEBUG=True)
class PasswordResetOTPTests(TestCase):
    def setUp(self):
        self.user = make_user(mobile="9123456789")

    def request_otp(self, mobile="9123456789"):
        return self.client.post(
            reverse("auth-otp-request"), {"mobile": mobile}, content_type="application/json"
        )

    def test_unregistered_mobile_gets_the_same_response_but_no_otp_row(self):
        res = self.request_otp(mobile="9000000099")
        self.assertEqual(res.status_code, 200)
        self.assertNotIn("otp_debug", res.json())
        self.assertEqual(PasswordResetOTP.objects.count(), 0)

    def test_fourth_request_within_15_minutes_sends_nothing_but_still_200s(self):
        # Each request backdates the previous OTP past the resend cooldown, so this
        # exercises the 15-minute/3-request limit rather than the 30-second cooldown.
        for _ in range(3):
            self.assertEqual(self.request_otp().status_code, 200)
            PasswordResetOTP.objects.update(created_at=timezone.now() - timedelta(seconds=31))
        self.assertEqual(PasswordResetOTP.objects.count(), 3)

        res = self.request_otp()
        self.assertEqual(res.status_code, 200)
        self.assertNotIn("otp_debug", res.json())  # rate-limited: nothing generated
        self.assertEqual(PasswordResetOTP.objects.count(), 3)

    def test_resend_within_cooldown_sends_nothing(self):
        self.assertEqual(self.request_otp().status_code, 200)
        res = self.request_otp()
        self.assertEqual(res.status_code, 200)
        self.assertNotIn("otp_debug", res.json())
        self.assertEqual(PasswordResetOTP.objects.count(), 1)

    def verify(self, code, mobile="9123456789"):
        return self.client.post(
            reverse("auth-otp-verify"),
            {"mobile": mobile, "code": code},
            content_type="application/json",
        )

    def test_correct_otp_issues_a_reset_token(self):
        code = self.request_otp().json()["otp_debug"]
        res = self.verify(code)
        self.assertEqual(res.status_code, 200)
        self.assertIn("reset_token", res.json())

    def test_five_wrong_attempts_invalidates_the_otp(self):
        self.request_otp()
        for _ in range(5):
            res = self.verify("0000")
        self.assertEqual(res.status_code, 400)
        self.assertTrue(res.json()["restart"])
        # Even the real code no longer works once invalidated.
        otp = PasswordResetOTP.objects.get(user=self.user)
        self.assertIsNotNone(otp.consumed_at)

    def test_expired_otp_is_rejected(self):
        code = self.request_otp().json()["otp_debug"]
        otp = PasswordResetOTP.objects.get(user=self.user)
        otp.expires_at = timezone.now() - timedelta(seconds=1)
        otp.save(update_fields=["expires_at"])
        res = self.verify(code)
        self.assertEqual(res.status_code, 400)

    def test_reset_token_works_exactly_once(self):
        code = self.request_otp().json()["otp_debug"]
        token = self.verify(code).json()["reset_token"]

        res = self.client.post(
            reverse("auth-password-reset"),
            {
                "mobile": "9123456789",
                "reset_token": token,
                "password": "newSunburn-Hoodie91",
                "confirm_password": "newSunburn-Hoodie91",
            },
            content_type="application/json",
        )
        self.assertEqual(res.status_code, 200)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password("newSunburn-Hoodie91"))

        # Reusing the same token must fail.
        res2 = self.client.post(
            reverse("auth-password-reset"),
            {
                "mobile": "9123456789",
                "reset_token": token,
                "password": "anotherSunburn-Hoodie91",
                "confirm_password": "anotherSunburn-Hoodie91",
            },
            content_type="application/json",
        )
        self.assertEqual(res2.status_code, 400)

    def test_reset_token_is_scoped_to_its_own_mobile(self):
        other = make_user(mobile="9000000011", email="other@example.com")
        code = self.request_otp().json()["otp_debug"]
        token = self.verify(code).json()["reset_token"]

        res = self.client.post(
            reverse("auth-password-reset"),
            {
                "mobile": "9000000011",
                "reset_token": token,
                "password": "newSunburn-Hoodie91",
                "confirm_password": "newSunburn-Hoodie91",
            },
            content_type="application/json",
        )
        self.assertEqual(res.status_code, 400)
        other.refresh_from_db()
        self.assertFalse(other.check_password("newSunburn-Hoodie91"))
