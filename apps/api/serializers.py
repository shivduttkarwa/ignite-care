from rest_framework import serializers

from apps.notices.models import Notice
from apps.people.models import ConditionTag, Home, Participant
from apps.records.models import CareRecord, OvernightAttendance
from apps.records.schema import load_schema, summarise


class HomeSerializer(serializers.ModelSerializer):
    label = serializers.CharField(read_only=True)
    participant_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = Home
        fields = ("id", "name", "label", "address", "participant_count")


class ConditionTagSerializer(serializers.ModelSerializer):
    class Meta:
        model = ConditionTag
        fields = ("id", "label", "tone")


class ParticipantListSerializer(serializers.ModelSerializer):
    full_name = serializers.CharField(read_only=True)
    initials = serializers.CharField(read_only=True)
    tags = ConditionTagSerializer(many=True, read_only=True)
    home = serializers.PrimaryKeyRelatedField(read_only=True)
    home_label = serializers.CharField(source="home.label", read_only=True)

    class Meta:
        model = Participant
        fields = (
            "id",
            "first_name",
            "last_name",
            "full_name",
            "preferred_name",
            "initials",
            "room",
            "home",
            "home_label",
            "tags",
            "shift_alert",
        )


class ParticipantDetailSerializer(ParticipantListSerializer):
    age = serializers.IntegerField(read_only=True)
    has_critical_notes = serializers.BooleanField(read_only=True)

    class Meta(ParticipantListSerializer.Meta):
        fields = ParticipantListSerializer.Meta.fields + (
            "date_of_birth",
            "age",
            "has_critical_notes",
            "allergies",
            "mobility",
            "communication",
            "emergency_contacts",
        )


class AttendanceSerializer(serializers.ModelSerializer):
    class Meta:
        model = OvernightAttendance
        fields = ("time", "purpose", "duration_minutes")


class StaffNameField(serializers.Field):
    """The short name a worker is known by, falling back sensibly."""

    def to_representation(self, user):
        if user is None:
            return None
        profile = getattr(user, "staff_profile", None)
        if profile is not None:
            return profile.short_name
        return user.get_full_name() or user.username


class CareRecordListSerializer(serializers.ModelSerializer):
    participant_name = serializers.CharField(source="participant.full_name", read_only=True)
    participant_initials = serializers.CharField(source="participant.initials", read_only=True)
    home_label = serializers.CharField(source="home.label", read_only=True)
    shift_label = serializers.CharField(source="get_shift_display", read_only=True)
    submitted_by_name = StaffNameField(source="submitted_by", read_only=True)
    created_by_name = StaffNameField(source="created_by", read_only=True)
    has_pdf = serializers.SerializerMethodField()
    summary = serializers.SerializerMethodField()
    form_title = serializers.SerializerMethodField()

    class Meta:
        model = CareRecord
        fields = (
            "id",
            "reference",
            "participant",
            "participant_name",
            "participant_initials",
            "home",
            "home_label",
            "service_date",
            "shift",
            "shift_label",
            "status",
            "not_required_reason",
            "schema_key",
            "schema_version",
            "form_title",
            "submitted_at",
            "submitted_by_name",
            "created_by_name",
            "shower",
            "bed_bath",
            "physio_completed",
            "bowel_recorded",
            "urine_recorded",
            "fluids_recorded",
            "has_pdf",
            "summary",
            "is_locked",
        )

    def get_has_pdf(self, record):
        return getattr(record, "document", None) is not None

    def get_summary(self, record):
        if record.status == "not_required":
            return [record.not_required_reason] if record.not_required_reason else []
        schema = load_schema(record.schema_key, record.schema_version)
        return summarise(schema, record.answers)

    def get_form_title(self, record):
        return load_schema(record.schema_key, record.schema_version)["short_title"]


class CareRecordDetailSerializer(CareRecordListSerializer):
    attendances = AttendanceSerializer(many=True, read_only=True)
    amendments = serializers.SerializerMethodField()

    class Meta(CareRecordListSerializer.Meta):
        fields = CareRecordListSerializer.Meta.fields + (
            "answers",
            "attendances",
            "amendments",
            "created_at",
            "updated_at",
        )

    def get_amendments(self, record):
        return [
            {
                "reason": a.reason,
                "body": a.body,
                "author": (a.author.get_full_name() or a.author.username),
                "created_at": a.created_at,
            }
            for a in record.amendments.all()
        ]


class NoticeSerializer(serializers.ModelSerializer):
    author_name = StaffNameField(source="author", read_only=True)
    author_is_manager = serializers.SerializerMethodField()
    is_unread = serializers.SerializerMethodField()
    homes = serializers.PrimaryKeyRelatedField(many=True, read_only=True)

    class Meta:
        model = Notice
        fields = (
            "id",
            "title",
            "body",
            "author_name",
            "author_is_manager",
            "homes",
            "is_pinned",
            "published_at",
            "is_unread",
        )

    def get_author_is_manager(self, notice):
        profile = getattr(notice.author, "staff_profile", None)
        return bool(profile and profile.is_manager)

    def get_is_unread(self, notice):
        return notice.pk in self.context.get("unread_ids", set())


class RecordWriteSerializer(serializers.Serializer):
    """Answers arrive as the schema defines them, not as model fields.

    Validation is deliberately left to apps.records.schema so the API and the
    HTML form enforce exactly the same rules from the same definition.
    """

    answers = serializers.DictField(required=False, default=dict)
    attendances = serializers.ListField(child=serializers.DictField(), required=False, default=list)
