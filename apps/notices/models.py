from django.conf import settings
from django.db import models

from apps.people.models import Home


class NoticeQuerySet(models.QuerySet):
    def for_home(self, home):
        if home is None:
            return self.filter(homes__isnull=True).distinct()
        return self.filter(models.Q(homes__isnull=True) | models.Q(homes=home)).distinct()

    def published(self):
        return self.filter(is_published=True)


class Notice(models.Model):
    title = models.CharField(max_length=160)
    body = models.TextField()
    author = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    homes = models.ManyToManyField(
        Home, blank=True, related_name="notices", help_text="Leave empty to show in every home."
    )
    is_pinned = models.BooleanField(default=False)
    is_published = models.BooleanField(default=True)
    published_at = models.DateTimeField(auto_now_add=True)

    objects = NoticeQuerySet.as_manager()

    class Meta:
        ordering = ("-is_pinned", "-published_at")

    def __str__(self):
        return self.title


class NoticeRead(models.Model):
    notice = models.ForeignKey(Notice, on_delete=models.CASCADE, related_name="reads")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    read_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=("notice", "user"), name="one_read_per_user_notice")
        ]

    def __str__(self):
        return f"{self.user} read {self.notice_id}"
