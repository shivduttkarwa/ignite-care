from django.contrib import admin

from .models import Notice


@admin.register(Notice)
class NoticeAdmin(admin.ModelAdmin):
    list_display = ("title", "author", "is_published", "is_pinned", "published_at")
    list_filter = ("is_published", "is_pinned", "homes")
    list_select_related = ("author",)
    search_fields = ("title", "body")
    filter_horizontal = ("homes",)
    fields = ("title", "body", "homes", "is_pinned", "is_published")

    def save_model(self, request, obj, form, change):
        if not obj.author_id:
            obj.author = request.user
        super().save_model(request, obj, form, change)
