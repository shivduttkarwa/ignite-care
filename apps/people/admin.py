from django.contrib import admin
from django.contrib.auth import get_user_model
from django.contrib.auth.admin import UserAdmin
from simple_history.admin import SimpleHistoryAdmin

from .models import ConditionTag, Home, Participant, StaffProfile

User = get_user_model()

admin.site.site_header = "Ignite portal administration"
admin.site.site_title = "Ignite portal"
admin.site.index_title = "People, homes and records"


@admin.register(Home)
class HomeAdmin(admin.ModelAdmin):
    list_display = ("name", "short_name", "position", "is_active")
    list_editable = ("position", "is_active")
    search_fields = ("name", "short_name")


@admin.register(ConditionTag)
class ConditionTagAdmin(admin.ModelAdmin):
    list_display = ("label", "tone", "position")
    list_editable = ("tone", "position")
    search_fields = ("label",)


@admin.register(Participant)
class ParticipantAdmin(SimpleHistoryAdmin):
    list_display = ("full_name", "home", "room", "is_active")
    list_filter = ("home", "is_active", "tags")
    list_select_related = ("home",)
    search_fields = ("first_name", "last_name", "preferred_name", "room")
    filter_horizontal = ("tags",)
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


class StaffProfileInline(admin.StackedInline):
    model = StaffProfile
    can_delete = False
    filter_horizontal = ("homes",)
    fields = ("role", "homes", "phone", "is_active")


admin.site.unregister(User)


@admin.register(User)
class StaffUserAdmin(UserAdmin):
    inlines = (StaffProfileInline,)
    list_display = ("username", "first_name", "last_name", "role", "is_active", "is_superuser")
    list_select_related = ("staff_profile",)

    @admin.display(description="Role")
    def role(self, user):
        profile = getattr(user, "staff_profile", None)
        return profile.get_role_display() if profile else "-"
