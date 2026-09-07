from django.conf import settings
from django.db import models
from django.utils import timezone
from simple_history.models import HistoricalRecords

from apps.people.models import Home, Participant


class Shift(models.TextChoices):
    MORNING = "morning", "Morning shift"
    AFTERNOON = "afternoon", "Afternoon shift"
    NIGHT = "night", "Night shift"


class RecordStatus(models.TextChoices):
    DRAFT = "draft", "Draft"
    SUBMITTED = "submitted", "Submitted"
    NOT_REQUIRED = "not_required", "Not required"
    VOID = "void", "Void"


class CareRecordQuerySet(models.QuerySet):
    def visible_to(self, user):
        if user.is_superuser:
            return self
        profile = getattr(user, "staff_profile", None)
        if profile is None:
            return self.none()
        return self.filter(home__in=profile.homes.all())

    def submitted(self):
        return self.filter(status=RecordStatus.SUBMITTED)

    def for_day(self, day):
        return self.filter(service_date=day)


class CareRecord(models.Model):
    """One form submission for one participant on one shift.

    Answers live in the answers field against a pinned schema version. The
    columns below are promoted copies of the fields the client filters and
    reports on, kept in step with answers on save.
    """

    participant = models.ForeignKey(Participant, on_delete=models.PROTECT, related_name="records")
    home = models.ForeignKey(Home, on_delete=models.PROTECT, related_name="records")
    service_date = models.DateField(help_text="The date the shift started.")
    shift = models.CharField(max_length=12, choices=Shift.choices)

    schema_key = models.CharField(max_length=60, default="daily_care")
    schema_version = models.CharField(max_length=20, default="v02")
    answers = models.JSONField(default=dict, blank=True)

    status = models.CharField(
        max_length=14, choices=RecordStatus.choices, default=RecordStatus.DRAFT
    )
    not_required_reason = models.TextField(blank=True)

    reference = models.CharField(max_length=30, unique=True, blank=True)

    shower = models.BooleanField(null=True, blank=True)
    bed_bath = models.BooleanField(null=True, blank=True)
    physio_completed = models.BooleanField(null=True, blank=True)
    bowel_recorded = models.BooleanField(default=False)
    urine_recorded = models.BooleanField(default=False)
    fluids_recorded = models.BooleanField(default=False)

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="records_created"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    submitted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="records_submitted",
        null=True,
        blank=True,
    )
    submitted_at = models.DateTimeField(null=True, blank=True)

    history = HistoricalRecords()
    objects = CareRecordQuerySet.as_manager()

    class Meta:
        ordering = ("-service_date", "-submitted_at", "-created_at")
        constraints = [
            models.UniqueConstraint(
                fields=("participant", "service_date", "shift", "schema_key"),
                name="one_record_per_participant_shift_form",
            )
        ]
        indexes = [
            models.Index(fields=("home", "service_date")),
            models.Index(fields=("participant", "service_date")),
            models.Index(fields=("status", "service_date")),
        ]

    def __str__(self):
        return f"{self.participant.full_name} - {self.service_date:%d %b %Y} - {self.get_shift_display()}"

    def save(self, *args, **kwargs):
        if not self.home_id and self.participant_id:
            self.home_id = self.participant.home_id
        if not self.reference:
            self.reference = self._build_reference()
        super().save(*args, **kwargs)

    @property
    def is_locked(self):
        return self.status in {RecordStatus.SUBMITTED, RecordStatus.VOID}

    @property
    def is_editable(self):
        return self.status == RecordStatus.DRAFT

    def _build_reference(self):
        prefix = getattr(settings, "RECORD_REF_PREFIX", "IG")
        year = (self.service_date or timezone.localdate()).year
        last = (
            CareRecord.objects.filter(reference__startswith=f"{prefix}-{year}-")
            .order_by("-reference")
            .values_list("reference", flat=True)
            .first()
        )
        nxt = int(last.rsplit("-", 1)[-1]) + 1 if last else 1
        return f"{prefix}-{year}-{nxt:05d}"


class OvernightAttendance(models.Model):
    """One 10pm to 6am attendance row inside a daily care record."""

    record = models.ForeignKey(CareRecord, on_delete=models.CASCADE, related_name="attendances")
    time = models.TimeField()
    purpose = models.CharField(max_length=200)
    duration_minutes = models.PositiveIntegerField()

    class Meta:
        ordering = ("time",)

    def __str__(self):
        return f"{self.time:%H:%M} {self.purpose} ({self.duration_minutes} min)"


class RecordAmendment(models.Model):
    """A correction appended to a locked record. Records are never edited in place."""

    record = models.ForeignKey(CareRecord, on_delete=models.CASCADE, related_name="amendments")
    author = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    reason = models.TextField()
    body = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("created_at",)

    def __str__(self):
        return f"Amendment to {self.record.reference}"


class AuditEvent(models.Model):
    """Reads and exports as well as writes. Who downloaded what matters for health data."""

    class Action(models.TextChoices):
        VIEW = "view", "Viewed"
        DOWNLOAD = "download", "Downloaded"
        EXPORT = "export", "Exported"
        SUBMIT = "submit", "Submitted"
        AMEND = "amend", "Amended"
        VOID = "void", "Voided"

    actor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    action = models.CharField(max_length=12, choices=Action.choices)
    target = models.CharField(max_length=200)
    detail = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("-created_at",)
        indexes = [models.Index(fields=("actor", "-created_at"))]

    def __str__(self):
        return f"{self.actor} {self.action} {self.target}"
