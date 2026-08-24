import re

from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers
from rest_framework.exceptions import AuthenticationFailed
from rest_framework.validators import UniqueValidator
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

User = get_user_model()

MOBILE_RE = re.compile(r"^\d{10}$")


def normalize_mobile(raw: str) -> str:
    """Strips +91 / spaces / hyphens down to the bare 10 digits. Raises
    serializers.ValidationError if what's left isn't exactly 10 digits."""
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
    # Declared explicitly (not left to ModelSerializer's auto-generation) so the
    # model's max_length=10/RegexValidator don't run against the raw "+91 xxxxx
    # xxxxx"-shaped input before validate_mobile() below gets a chance to
    # normalize it — DRF runs field-level validators before validate_<field>.
    # UniqueValidator is kept explicitly: DRF excludes the current instance on
    # update automatically, so saving your own mobile back to itself isn't
    # rejected, only a real collision with someone else's is.
    mobile = serializers.CharField(validators=[UniqueValidator(queryset=User.objects.all())])

    class Meta:
        model = User
        fields = ["id", "email", "first_name", "last_name", "mobile", "date_of_birth", "gender"]
        # email is the login identity — not editable through the /profile CRUD form.
        read_only_fields = ["email"]

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
        # Uniqueness is handled explicitly in RegisterView.create — a named 409
        # ("Email ID already exists" / "Mobile number already exists"), not DRF's
        # default 400 UniqueValidator, which the ModelSerializer would otherwise
        # add automatically for both unique fields.
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
    """Accepts an `identifier` (email or 10-digit mobile) instead of a bare email
    field, resolves it to the matching user's email, then delegates to simplejwt's
    normal password check. Any failure — unknown identifier or wrong password —
    must look identical from the outside, so this never leaks which one it was."""

    identifier = serializers.CharField(write_only=True)
    password = serializers.CharField(write_only=True)

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        # simplejwt wires up `email` (USERNAME_FIELD) as required; we take
        # `identifier` instead and resolve it ourselves in validate().
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
            # Re-raised with a fixed message: simplejwt's own message already
            # doesn't distinguish unknown-account from wrong-password, but this
            # makes that guarantee explicit rather than incidental.
            raise AuthenticationFailed("Invalid credentials")
        data["user"] = UserSerializer(self.user).data
        return data


class OTPRequestSerializer(serializers.Serializer):
    mobile = serializers.CharField()

    def validate_mobile(self, value):
        return normalize_mobile(value)


class OTPVerifySerializer(serializers.Serializer):
    mobile = serializers.CharField()
    code = serializers.CharField(min_length=4, max_length=4)

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
