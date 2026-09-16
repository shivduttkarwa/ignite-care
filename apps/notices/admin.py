from django.contrib import admin
from unfold.admin import ModelAdmin

from .models import Notice


@admin.register(Notice)
class NoticeAdmin(ModelAdmin):
    list_display = ("title", "author", "is_published", "is_pinned", "published_at")
    list_filter = ("is_published", "is_pinned", "homes")
    list_select_related = ("author",)
    search_fields = ("title", "body")
    filter_horizontal = ("homes",)
    warn_unsaved_form = True
    fields = ("title", "body", "homes", "is_pinned", "is_published")

    def save_model(self, request, obj, form, change):
        if not obj.author_id:
            obj.author = request.user
        super().save_model(request, obj, form, change)
