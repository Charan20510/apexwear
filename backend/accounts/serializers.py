# Serializers for auth, registration, OTP reset, and addresses.

import re

from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers
from rest_framework.exceptions import AuthenticationFailed
from rest_framework.validators import UniqueValidator
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

from .models import Address, PasswordResetOTP

User = get_user_model()

MOBILE_RE = re.compile(r"^\d{10}$")
PINCODE_RE = re.compile(r"^[1-9]\d{5}$")  # India Post PINs: 6 digits, never start with 0


def normalize_mobile(raw: str) -> str:
    # Strips +91/spaces/hyphens to bare 10 digits; raises ValidationError otherwise.
    digits = re.sub(r"[\s-]", "", raw or "")
    if digits.startswith("+91"):
        digits = digits[3:]
    elif digits.startswith("91") and len(digits) == 12:
        digits = digits[2:]
    elif digits.startswith("0") and len(digits) == 11:
        digits = digits[1:]
    if not MOBILE_RE.match(digits):
        raise serializers.ValidationError("Enter a valid 10-digit mobile number.")
    return digits


class UserSerializer(serializers.ModelSerializer):
    # Declared explicitly so validate_mobile() normalizes the raw input before field validators run.
    mobile = serializers.CharField(validators=[UniqueValidator(queryset=User.objects.all())])

    class Meta:
        model = User
        fields = ["id", "email", "first_name", "last_name", "mobile", "date_of_birth", "gender"]
        read_only_fields = ["email"]  # login identity, not editable via /profile

    def validate_mobile(self, value):
        return normalize_mobile(value)


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=8)
    confirm_password = serializers.CharField(write_only=True, min_length=8)

    class Meta:
        model = User
        fields = [
            "email",
            "password",
            "confirm_password",
            "first_name",
            "last_name",
            "date_of_birth",
            "mobile",
            "gender",
        ]
        # Uniqueness handled explicitly in RegisterView.create for a named 409, not DRF's default 400.
        extra_kwargs = {
            "email": {"validators": []},
            "mobile": {"validators": []},
        }

    def validate_email(self, value):
        return User.objects.normalize_email(value)

    def validate_mobile(self, value):
        return normalize_mobile(value)

    def validate_password(self, value):
        validate_password(value)
        return value

    def validate(self, attrs):
        if attrs["password"] != attrs.pop("confirm_password"):
            raise serializers.ValidationError({"confirm_password": "Passwords do not match."})
        return attrs

    def create(self, validated_data):
        return User.objects.create_user(**validated_data)


class EmailTokenObtainPairSerializer(TokenObtainPairSerializer):
    # Accepts email-or-mobile `identifier`, resolves to email, then delegates to simplejwt.
    identifier = serializers.CharField(write_only=True)
    password = serializers.CharField(write_only=True)

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields.pop(self.username_field, None)

    def validate(self, attrs):
        identifier = attrs.get("identifier", "").strip()
        email = identifier.lower()
        try:
            mobile = normalize_mobile(identifier)
        except serializers.ValidationError:
            mobile = None
        if mobile:
            user = User.objects.filter(mobile=mobile).first()
            if user:
                email = user.email

        try:
            data = super().validate({self.username_field: email, "password": attrs["password"]})
        except AuthenticationFailed:
            # Fixed message — never distinguishes unknown-account from wrong-password.
            raise AuthenticationFailed("Invalid credentials")
        data["user"] = UserSerializer(self.user).data
        return data


class OTPRequestSerializer(serializers.Serializer):
    mobile = serializers.CharField()

    def validate_mobile(self, value):
        return normalize_mobile(value)


class OTPVerifySerializer(serializers.Serializer):
    mobile = serializers.CharField()
    # Length pulled from the model so generator and validator can't drift apart.
    code = serializers.CharField(
        min_length=PasswordResetOTP.CODE_LENGTH, max_length=PasswordResetOTP.CODE_LENGTH
    )

    def validate_mobile(self, value):
        return normalize_mobile(value)


class PasswordResetSerializer(serializers.Serializer):
    mobile = serializers.CharField()
    reset_token = serializers.CharField()
    password = serializers.CharField(min_length=8)
    confirm_password = serializers.CharField(min_length=8)

    def validate_mobile(self, value):
        return normalize_mobile(value)

    def validate_password(self, value):
        validate_password(value)
        return value

    def validate(self, attrs):
        if attrs["password"] != attrs["confirm_password"]:
            raise serializers.ValidationError({"confirm_password": "Passwords do not match."})
        return attrs


class AddressSerializer(serializers.ModelSerializer):
    class Meta:
        model = Address
        fields = ["id", "name", "phone", "line1", "line2", "city", "state", "pincode", "is_default"]

    def validate_phone(self, value):
        return normalize_mobile(value)

    def validate_pincode(self, value):
        digits = re.sub(r"[\s-]", "", value or "")
        if not PINCODE_RE.match(digits):
            raise serializers.ValidationError("Enter a valid 6-digit PIN code.")
        return digits

    def create(self, validated_data):
        user = self.context["request"].user  # set in the view, never sent by the client
        if validated_data.get("is_default"):
            Address.objects.filter(user=user, is_default=True).update(is_default=False)
        return Address.objects.create(user=user, **validated_data)

    def update(self, instance, validated_data):
        if validated_data.get("is_default"):
            Address.objects.filter(user=instance.user, is_default=True).exclude(pk=instance.pk).update(
                is_default=False
            )
        return super().update(instance, validated_data)
