from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.exceptions import FieldDoesNotExist
from django.test import TestCase, override_settings
from django.urls import reverse

from .views import REFRESH_COOKIE

User = get_user_model()


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
            User.objects.create_user(email="", password="password1234")

    def test_create_user_normalises_the_email_domain(self):
        user = User.objects.create_user(email="Person@EXAMPLE.COM", password="password1234")
        self.assertEqual(user.email, "Person@example.com")

    def test_create_superuser_with_email_alone(self):
        admin = User.objects.create_superuser(email="boss@apexwear.test", password="password1234")
        self.assertTrue(admin.is_staff)
        self.assertTrue(admin.is_superuser)
        self.assertEqual(admin.email, "boss@apexwear.test")


class RegisterTests(TestCase):
    def test_register_returns_access_token_and_sets_refresh_cookie(self):
        res = self.client.post(
            reverse("auth-register"),
            {"email": "new@apexwear.test", "password": "password1234"},
            content_type="application/json",
        )
        self.assertEqual(res.status_code, 201)
        self.assertIn("access", res.json())
        self.assertEqual(res.json()["user"]["email"], "new@apexwear.test")

        cookie = res.cookies[REFRESH_COOKIE]
        self.assertTrue(cookie["httponly"])
        self.assertEqual(cookie["path"], "/api/auth")
        # The refresh token must never be readable from the JSON body.
        self.assertNotIn("refresh", res.json())

    def test_duplicate_email_is_rejected(self):
        User.objects.create_user(email="dupe@apexwear.test", password="password1234")
        res = self.client.post(
            reverse("auth-register"),
            {"email": "dupe@apexwear.test", "password": "password1234"},
            content_type="application/json",
        )
        self.assertEqual(res.status_code, 400)

    def test_short_password_is_rejected(self):
        res = self.client.post(
            reverse("auth-register"),
            {"email": "short@apexwear.test", "password": "abc"},
            content_type="application/json",
        )
        self.assertEqual(res.status_code, 400)
        self.assertFalse(User.objects.filter(email="short@apexwear.test").exists())


class LoginAndSessionTests(TestCase):
    def setUp(self):
        self.password = "password1234"
        self.user = User.objects.create_user(email="user@apexwear.test", password=self.password)

    def login(self):
        return self.client.post(
            reverse("auth-login"),
            {"email": self.user.email, "password": self.password},
            content_type="application/json",
        )

    def test_login_with_correct_password(self):
        res = self.login()
        self.assertEqual(res.status_code, 200)
        self.assertIn("access", res.json())
        self.assertNotIn("refresh", res.json())
        self.assertIn(REFRESH_COOKIE, res.cookies)

    def test_login_with_wrong_password_is_rejected(self):
        res = self.client.post(
            reverse("auth-login"),
            {"email": self.user.email, "password": "wrong-password"},
            content_type="application/json",
        )
        self.assertEqual(res.status_code, 401)

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
    def test_new_google_user_is_created_with_an_unusable_password(self, mock_verify):
        mock_verify.return_value = google_claims()
        res = self.post()

        self.assertEqual(res.status_code, 201)
        self.assertIn("access", res.json())
        self.assertIn(REFRESH_COOKIE, res.cookies)

        user = User.objects.get(email="gtest@apexwear.test")
        self.assertFalse(user.has_usable_password())
        self.assertEqual(user.first_name, "Given")
        self.assertEqual(user.last_name, "Family")

    @patch("accounts.views.id_token.verify_oauth2_token")
    def test_existing_password_account_is_linked_not_duplicated(self, mock_verify):
        existing = User.objects.create_user(email="gtest@apexwear.test", password="password1234")
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
