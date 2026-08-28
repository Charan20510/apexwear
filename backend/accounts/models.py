# User, Address, and OTP password-reset models.

import secrets

from django.contrib.auth.base_user import AbstractBaseUser, BaseUserManager
from django.contrib.auth.models import PermissionsMixin
from django.core.validators import RegexValidator
from django.db import models
from django.db.models.functions import Lower
from django.utils import timezone

mobile_validator = RegexValidator(r"^\d{10}$", "Mobile number must be exactly 10 digits.")


def random_placeholder_mobile() -> str:
    # Starts with '0' — real Indian mobiles start 6-9, so this can't collide with one.
    return "0" + "".join(str(secrets.randbelow(10)) for _ in range(9))


class UserManager(BaseUserManager):
    use_in_migrations = True

    def normalize_email(self, email):
        # Default normalize_email only lowercases the domain — the DB's citext-style
        # unique constraint needs the whole address lowercased.
        email = email or ""
        return email.strip().lower()

    def create_user(self, email, password=None, **extra_fields):
        if not email:
            raise ValueError("Users must have an email address")
        email = self.normalize_email(email)
        user = self.model(email=email, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, email, password=None, **extra_fields):
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)
        extra_fields.setdefault("first_name", "Admin")
        extra_fields.setdefault("date_of_birth", "1990-01-01")
        extra_fields.setdefault("gender", User.Gender.OTHER)
        extra_fields.setdefault("mobile", random_placeholder_mobile())
        if extra_fields.get("is_staff") is not True:
            raise ValueError("Superuser must have is_staff=True")
        if extra_fields.get("is_superuser") is not True:
            raise ValueError("Superuser must have is_superuser=True")
        return self.create_user(email, password, **extra_fields)


class User(AbstractBaseUser, PermissionsMixin):
    class Gender(models.TextChoices):
        MALE = "male", "Male"
        FEMALE = "female", "Female"
        OTHER = "other", "Other"

    email = models.EmailField(unique=True)
    first_name = models.CharField(max_length=150)
    last_name = models.CharField(max_length=150, blank=True)
    date_of_birth = models.DateField()
    mobile = models.CharField(max_length=10, unique=True, validators=[mobile_validator])
    gender = models.CharField(max_length=6, choices=Gender.choices)
    is_staff = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
    date_joined = models.DateTimeField(auto_now_add=True)

    objects = UserManager()

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = []

    class Meta:
        constraints = [
            models.UniqueConstraint(Lower("email"), name="user_email_ci_unique"),
        ]

    def __str__(self):
        return self.email


class Address(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="addresses")
    name = models.CharField(max_length=150)
    phone = models.CharField(max_length=20)
    line1 = models.CharField(max_length=255)
    line2 = models.CharField(max_length=255, blank=True)
    city = models.CharField(max_length=100)
    state = models.CharField(max_length=100)
    pincode = models.CharField(max_length=10)
    is_default = models.BooleanField(default=False)

    class Meta:
        constraints = [
            # DB-level guard: the serializer's clear-then-set is two statements,
            # which a race could otherwise leave with two defaults.
            models.UniqueConstraint(
                fields=["user"],
                condition=models.Q(is_default=True),
                name="one_default_address_per_user",
            )
        ]

    def __str__(self):
        return f"{self.name}, {self.city} {self.pincode}"


class PasswordResetOTP(models.Model):
    # code_hash/token_hash use Django's password hasher — never stored plaintext.

    OTP_TTL_MINUTES = 10
    MAX_ATTEMPTS = 5
    # 6 digits: 3 requests x 5 guesses = 15 tries/15min window, 0.0015% against this space.
    CODE_LENGTH = 6

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="reset_otps")
    code_hash = models.CharField(max_length=128)
    token_hash = models.CharField(max_length=128, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()
    attempts = models.PositiveSmallIntegerField(default=0)
    consumed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        indexes = [models.Index(fields=["user", "created_at"])]

    def is_live(self):
        return self.consumed_at is None and self.expires_at > timezone.now()

    def __str__(self):
        return f"OTP for {self.user_id} @ {self.created_at:%Y-%m-%d %H:%M}"
