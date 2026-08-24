from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as DjangoUserAdmin

from .models import Address, PasswordResetOTP, User


@admin.register(User)
class UserAdmin(DjangoUserAdmin):
    ordering = ["email"]
    list_display = ["email", "first_name", "last_name", "mobile", "is_staff", "is_active"]
    search_fields = ["email", "first_name", "last_name", "mobile"]
    fieldsets = (
        (None, {"fields": ("email", "password")}),
        (
            "Personal info",
            {"fields": ("first_name", "last_name", "mobile", "date_of_birth", "gender")},
        ),
        (
            "Permissions",
            {"fields": ("is_active", "is_staff", "is_superuser", "groups", "user_permissions")},
        ),
        ("Important dates", {"fields": ("last_login", "date_joined")}),
    )
    add_fieldsets = (
        (
            None,
            {
                "classes": ("wide",),
                "fields": (
                    "email",
                    "password1",
                    "password2",
                    "first_name",
                    "mobile",
                    "date_of_birth",
                    "gender",
                ),
            },
        ),
    )
    readonly_fields = ["date_joined"]


@admin.register(Address)
class AddressAdmin(admin.ModelAdmin):
    list_display = ["user", "name", "city", "pincode", "is_default"]
    search_fields = ["name", "city", "pincode", "user__email"]
    list_filter = ["is_default", "state"]


@admin.register(PasswordResetOTP)
class PasswordResetOTPAdmin(admin.ModelAdmin):
    list_display = ["user", "created_at", "expires_at", "attempts", "consumed_at"]
    search_fields = ["user__email", "user__mobile"]
    readonly_fields = [f.name for f in PasswordResetOTP._meta.fields]
