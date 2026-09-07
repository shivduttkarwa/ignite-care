from django.conf import settings
from django.db import models
from simple_history.models import HistoricalRecords


class Home(models.Model):
    """A residential care home. The client calls these properties or houses."""

    name = models.CharField(max_length=120, unique=True)
    short_name = models.CharField(max_length=40, blank=True)
    address = models.TextField(blank=True)
    position = models.PositiveSmallIntegerField(default=0)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ("position", "name")

    def __str__(self):
        return self.name

    @property
    def label(self):
        return self.short_name or self.name


class ConditionTag(models.Model):
    """Risk and condition labels shown against a participant."""

    class Tone(models.TextChoices):
        NEUTRAL = "neutral", "Neutral"
        CAUTION = "caution", "Caution"

    label = models.CharField(max_length=60, unique=True)
    tone = models.CharField(max_length=10, choices=Tone.choices, default=Tone.NEUTRAL)
    position = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ("position", "label")

    def __str__(self):
        return self.label


class ParticipantQuerySet(models.QuerySet):
    def visible_to(self, user):
        if user.is_superuser:
            return self
        profile = getattr(user, "staff_profile", None)
        if profile is None:
            return self.none()
        if profile.is_manager:
            return self.filter(home__in=profile.homes.all())
        return self.filter(home__in=profile.homes.all())

    def active(self):
        return self.filter(is_active=True)


class Participant(models.Model):
    """A person receiving care. Never 'patient', 'client' or 'resident'."""

    first_name = models.CharField(max_length=80)
    last_name = models.CharField(max_length=80)
    preferred_name = models.CharField(max_length=80, blank=True)
    date_of_birth = models.DateField(null=True, blank=True)
    home = models.ForeignKey(Home, on_delete=models.PROTECT, related_name="participants")
    room = models.CharField(max_length=40, blank=True)
    tags = models.ManyToManyField(ConditionTag, blank=True, related_name="participants")

    allergies = models.TextField(blank=True)
    mobility = models.TextField(blank=True)
    communication = models.TextField(blank=True)
    emergency_contacts = models.TextField(blank=True)
    shift_alert = models.CharField(
        max_length=200,
        blank=True,
        help_text="One line shown on the dashboard row, e.g. 'Do not leave unattended near stairs'.",
    )

    is_active = models.BooleanField(default=True)
    history = HistoricalRecords()

    objects = ParticipantQuerySet.as_manager()

    class Meta:
        ordering = ("first_name", "last_name")

    def __str__(self):
        return self.full_name

    @property
    def full_name(self):
        return f"{self.first_name} {self.last_name}".strip()

    @property
    def initials(self):
        return f"{self.first_name[:1]}{self.last_name[:1]}".upper()

    @property
    def age(self):
        if not self.date_of_birth:
            return None
        from django.utils import timezone

        today = timezone.localdate()
        born = self.date_of_birth
        return today.year - born.year - ((today.month, today.day) < (born.month, born.day))

    @property
    def has_critical_notes(self):
        return any([self.allergies, self.mobility, self.communication, self.emergency_contacts])


class StaffProfile(models.Model):
    class Role(models.TextChoices):
        WORKER = "worker", "Support worker"
        MANAGER = "manager", "Manager"

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="staff_profile"
    )
    role = models.CharField(max_length=10, choices=Role.choices, default=Role.WORKER)
    homes = models.ManyToManyField(Home, blank=True, related_name="staff")
    phone = models.CharField(max_length=40, blank=True)
    is_active = models.BooleanField(default=True)

    def __str__(self):
        return f"{self.user.get_full_name() or self.user.username} ({self.get_role_display()})"

    @property
    def is_manager(self):
        return self.role == self.Role.MANAGER

    @property
    def initials(self):
        name = self.user.get_full_name().strip()
        if name:
            parts = name.split()
            return f"{parts[0][:1]}{parts[-1][:1]}".upper()
        return self.user.username[:2].upper()

    @property
    def short_name(self):
        name = self.user.get_full_name().strip()
        if not name:
            return self.user.username
        parts = name.split()
        return f"{parts[0]} {parts[-1][:1]}" if len(parts) > 1 else parts[0]
