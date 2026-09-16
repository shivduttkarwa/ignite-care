from django.contrib import admin
from unfold.admin import ModelAdmin, TabularInline

from .models import AttachedForm, AuditEvent, CareRecord


class ReadOnlyAdmin(ModelAdmin):
    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


class AttachedFormInline(TabularInline):
    model = AttachedForm
    fields = ("position", "schema_key", "status", "submitted_by", "submitted_at")
    readonly_fields = fields
    extra = 0
    can_delete = False

    def has_add_permission(self, request, obj=None):
        return False


@admin.register(CareRecord)
class CareRecordAdmin(ReadOnlyAdmin):
    list_display = (
        "reference",
        "participant",
        "home",
        "service_date",
        "shift",
        "status",
        "submitted_by",
    )
    list_filter = ("status", "shift", "home")
    list_filter_submit = True
    list_select_related = ("participant", "home", "submitted_by")
    search_fields = ("reference", "participant__first_name", "participant__last_name")
    date_hierarchy = "service_date"
    inlines = (AttachedFormInline,)


@admin.register(AuditEvent)
class AuditEventAdmin(ReadOnlyAdmin):
    list_display = ("created_at", "actor", "action", "target")
    list_filter = ("action",)
    list_filter_submit = True
    list_select_related = ("actor",)
    search_fields = ("target", "actor__username")
    date_hierarchy = "created_at"
