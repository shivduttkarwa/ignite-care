from django.contrib import admin
from django.contrib.auth import get_user_model
from django.contrib.auth.admin import UserAdmin
from django.contrib.auth.models import Group
from simple_history.admin import SimpleHistoryAdmin
from unfold.admin import ModelAdmin, StackedInline
from unfold.forms import AdminPasswordChangeForm, UserChangeForm, UserCreationForm

from .models import ConditionTag, Home, Participant, StaffProfile

User = get_user_model()


@admin.register(Home)
class HomeAdmin(ModelAdmin):
    list_display = ("name", "short_name", "position", "is_active")
    list_editable = ("position", "is_active")
    search_fields = ("name", "short_name")
    warn_unsaved_form = True


@admin.register(ConditionTag)
class ConditionTagAdmin(ModelAdmin):
    list_display = ("label", "tone", "position")
    list_editable = ("tone", "position")
    search_fields = ("label",)
    warn_unsaved_form = True


@admin.register(Participant)
class ParticipantAdmin(SimpleHistoryAdmin, ModelAdmin):
    list_display = ("full_name", "home", "room", "is_active")
    list_filter = ("home", "is_active", "tags")
    list_filter_submit = True
    list_select_related = ("home",)
    search_fields = ("first_name", "last_name", "preferred_name", "room")
    filter_horizontal = ("tags",)
    warn_unsaved_form = True
    fieldsets = (
        (
            None,
            {"fields": ("first_name", "last_name", "preferred_name", "date_of_birth", "is_active")},
        ),
        ("Where they live", {"fields": ("home", "room")}),
        ("On the dashboard", {"fields": ("tags", "shift_alert")}),
        (
            "Critical notes",
            {"fields": ("allergies", "mobility", "communication", "emergency_contacts")},
        ),
    )


class StaffProfileInline(StackedInline):
    model = StaffProfile
    can_delete = False
    filter_horizontal = ("homes",)
    fields = ("role", "homes", "phone", "is_active")
    tab = True


# Access is decided by StaffProfile.role, so Django groups are only noise here.
admin.site.unregister(Group)
admin.site.unregister(User)


@admin.register(User)
class StaffUserAdmin(UserAdmin, ModelAdmin):
    form = UserChangeForm
    add_form = UserCreationForm
    change_password_form = AdminPasswordChangeForm
    inlines = (StaffProfileInline,)
    list_display = ("username", "first_name", "last_name", "role", "is_active", "is_superuser")
    list_select_related = ("staff_profile",)
    warn_unsaved_form = True

    @admin.display(description="Role")
    def role(self, user):
        profile = getattr(user, "staff_profile", None)
        return profile.get_role_display() if profile else "-"
