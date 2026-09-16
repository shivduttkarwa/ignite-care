"""The JSON API.

Every endpoint reuses the same querysets, schema engine and PDF pipeline as the
HTML views. Nothing about the business rules is reimplemented here - if the two
ever disagree, that is a bug.
"""

import datetime as dt

from django.contrib.auth import get_user_model
from django.db import IntegrityError, transaction
from django.db.models import Max, Q
from django.http import FileResponse, Http404, HttpResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.notices.models import Notice, NoticeRead
from apps.pdfgen.render import build_participant_book, build_record_document
from apps.people.models import Participant
from apps.records.attachments import attachment_label
from apps.records.filters import base_queryset, filter_records, read_params
from apps.records.models import (
    AttachedForm,
    AttachmentStatus,
    AuditEvent,
    CareRecord,
    OvernightAttendance,
    RecordStatus,
    Shift,
)
from apps.records.schema import (
    attachable_schema,
    available_schemas,
    clean_answers,
    has_content,
    load_schema,
    prefilled_answers,
    promoted_values,
    validate,
)
from apps.records.services import (
    current_shift,
    previous_shift,
    records_for_participants,
    shift_label,
    shift_rows,
    shift_state,
)

from .serializers import (
    AttachedFormSerializer,
    AttachmentWriteSerializer,
    CareRecordDetailSerializer,
    CareRecordListSerializer,
    HomeSerializer,
    NoticeSerializer,
    ParticipantDetailSerializer,
    ParticipantListSerializer,
    RecordWriteSerializer,
)

User = get_user_model()
DEFAULT_SCHEMA = ("daily_care", "v02")


class RecordPagination(PageNumberPagination):
    page_size = 25
    page_size_query_param = "page_size"
    max_page_size = 100


def _is_manager(user):
    profile = getattr(user, "staff_profile", None)
    return bool(user.is_superuser or (profile and profile.is_manager))


def _as_date(value):
    return dt.date.fromisoformat(value) if value else None


def _active_home(request):
    """The home the caller is working in, honouring an explicit ?home= override."""
    requested = request.query_params.get("home")
    if requested:
        home = request.available_homes.filter(pk=requested).first()
        if home:
            return home
    return request.active_home


# Identity -------------------------------------------------------------------


class MeView(APIView):
    def get(self, request):
        profile = getattr(request.user, "staff_profile", None)
        homes = request.available_homes
        shift, service_date = current_shift()
        return Response(
            {
                "id": request.user.pk,
                "username": request.user.username,
                "full_name": request.user.get_full_name(),
                "initials": profile.initials if profile else request.user.username[:2].upper(),
                "role": profile.role if profile else None,
                "is_manager": _is_manager(request.user),
                "homes": [
                    {
                        "id": h.pk,
                        "name": h.name,
                        "label": h.label,
                        "participant_count": h.participants.filter(is_active=True).count(),
                    }
                    for h in homes
                ],
                "active_home": request.active_home.pk if request.active_home else None,
                "shift": {
                    "key": shift,
                    "label": shift_label(shift),
                    "service_date": service_date,
                },
            }
        )


@api_view(["GET"])
def homes(request):
    rows = [
        {
            "id": h.pk,
            "name": h.name,
            "label": h.label,
            "address": h.address,
            "participant_count": h.participants.filter(is_active=True).count(),
        }
        for h in request.available_homes
    ]
    return Response(rows)


@api_view(["POST"])
def switch_home(request):
    home_id = request.data.get("home")
    if not request.available_homes.filter(pk=home_id).exists():
        return Response({"detail": "That home is not available to you."}, status=404)
    from apps.people.middleware import SESSION_KEY

    request.session[SESSION_KEY] = int(home_id)
    return Response({"active_home": int(home_id)})


# Form schemas ---------------------------------------------------------------


@api_view(["GET"])
def schema_list(request):
    """Every form the portal knows about.

    A client renders forms from these, so adding a form needs no client release.
    """
    return Response(
        [
            {
                "key": s["key"],
                "version": s["version"],
                "title": s["title"],
                "short_title": s["short_title"],
                "badge": s.get("badge", ""),
                "attachable": s.get("attachable", False),
            }
            for s in available_schemas()
        ]
    )


@api_view(["GET"])
def schema_detail(request, key, version):
    try:
        return Response(load_schema(key, version))
    except Exception as exc:  # noqa: BLE001
        raise Http404(f"No schema {key} {version}") from exc


# Participants ---------------------------------------------------------------


@api_view(["GET"])
def participant_list(request):
    people = (
        Participant.objects.visible_to(request.user)
        .active()
        .select_related("home")
        .prefetch_related("tags")
        .order_by("home__position", "first_name", "last_name")
    )
    query = request.query_params.get("q", "").strip()
    if query:
        people = people.filter(
            Q(first_name__icontains=query)
            | Q(last_name__icontains=query)
            | Q(preferred_name__icontains=query)
            | Q(room__icontains=query)
        )
    home = request.query_params.get("home")
    if home:
        people = people.filter(home_id=home)

    people = list(people)
    shift, service_date = current_shift()
    lodged = records_for_participants(people, service_date, shift)

    rows = ParticipantListSerializer(people, many=True).data
    for row in rows:
        record = lodged.get(row["id"])
        row["shift_state"] = shift_state(record)
        row["shift_record_id"] = record.pk if record else None
        row["shift_is_done"] = record is not None and record.status in {
            RecordStatus.SUBMITTED,
            RecordStatus.NOT_REQUIRED,
        }
    return Response(rows)


@api_view(["GET"])
def participant_detail(request, pk):
    person = get_object_or_404(
        Participant.objects.visible_to(request.user).prefetch_related("tags"), pk=pk
    )
    return Response(ParticipantDetailSerializer(person).data)


@api_view(["GET"])
def participant_records(request, pk):
    person = get_object_or_404(Participant.objects.visible_to(request.user), pk=pk)
    try:
        days = int(request.query_params.get("days", 7))
    except ValueError:
        days = 7
    days = max(1, min(days, 365))
    since = timezone.localdate() - dt.timedelta(days=days - 1)

    records = (
        person.records.filter(service_date__gte=since)
        .exclude(status=RecordStatus.DRAFT)
        .select_related("submitted_by__staff_profile", "created_by", "home", "participant")
        .prefetch_related("attachments")
        .order_by("-service_date", "-submitted_at")
    )
    return Response(
        {
            "days": days,
            "since": since,
            "results": CareRecordListSerializer(records, many=True).data,
        }
    )


# Records --------------------------------------------------------------------


def _filtered_records(request):
    """The same filtering the manager screen uses, from the same module."""
    selected = read_params(request.query_params)
    return filter_records(base_queryset(request.user), selected).order_by(
        "-service_date", "-submitted_at"
    )


@api_view(["GET"])
def record_list(request):
    if not _is_manager(request.user):
        return Response({"detail": "Managers only."}, status=status.HTTP_403_FORBIDDEN)

    records = _filtered_records(request)
    paginator = RecordPagination()
    page = paginator.paginate_queryset(records, request)
    return paginator.get_paginated_response(CareRecordListSerializer(page, many=True).data)


@api_view(["GET"])
def record_detail(request, pk):
    record = get_object_or_404(
        CareRecord.objects.visible_to(request.user)
        .select_related("participant", "home", "submitted_by__staff_profile", "created_by")
        .prefetch_related("attachments"),
        pk=pk,
    )
    AuditEvent.objects.create(
        actor=request.user, action=AuditEvent.Action.VIEW, target=record.reference
    )
    return Response(CareRecordDetailSerializer(record).data)


@api_view(["POST"])
def record_start(request):
    """Open (or reopen) the draft for a participant's current shift."""
    participant = get_object_or_404(
        Participant.objects.visible_to(request.user).active(),
        pk=request.data.get("participant"),
    )
    shift, service_date = current_shift()
    key, version = DEFAULT_SCHEMA

    record, created = CareRecord.objects.get_or_create(
        participant=participant,
        service_date=service_date,
        shift=shift,
        schema_key=key,
        defaults={
            "home": participant.home,
            "schema_version": version,
            "created_by": request.user,
            "answers": {},
        },
    )
    return Response(
        CareRecordDetailSerializer(record).data,
        status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
    )


def _apply(record, schema, payload):
    """Clean the answers, drop hidden ones, and sync the reportable columns."""
    answers = clean_answers(schema, payload.get("answers", {}))
    record.answers = answers
    for column, value in promoted_values(schema, answers).items():
        setattr(record, column, value)
    return answers


def _save_attendances(record, rows):
    record.attendances.all().delete()
    clean = []
    for row in rows:
        time_value, purpose = row.get("time"), (row.get("purpose") or "").strip()
        if not (time_value and purpose):
            continue
        try:
            minutes = int(row.get("duration_minutes") or 0)
        except (TypeError, ValueError):
            minutes = 0
        clean.append(
            OvernightAttendance(
                record=record, time=time_value, purpose=purpose, duration_minutes=minutes
            )
        )
    OvernightAttendance.objects.bulk_create(clean)


def _unfinished_attachment(record):
    for attachment in list(record.attachments.filter(status=AttachmentStatus.DRAFT)):
        schema = load_schema(attachment.schema_key, attachment.schema_version)
        if has_content(schema, attachment.answers):
            return attachment
        attachment.delete()
    return None


@api_view(["PATCH"])
def record_save_draft(request, pk):
    record = get_object_or_404(CareRecord.objects.visible_to(request.user), pk=pk)
    if record.is_locked:
        return Response(
            {"detail": "This record is submitted and can no longer be edited."},
            status=status.HTTP_409_CONFLICT,
        )

    payload = RecordWriteSerializer(data=request.data)
    payload.is_valid(raise_exception=True)

    schema = load_schema(record.schema_key, record.schema_version)
    _apply(record, schema, payload.validated_data)
    record.save()
    _save_attendances(record, payload.validated_data.get("attendances", []))

    return Response(CareRecordDetailSerializer(record).data)


@api_view(["POST"])
def record_submit(request, pk):
    record = get_object_or_404(CareRecord.objects.visible_to(request.user), pk=pk)
    if record.is_locked:
        return Response(
            {"detail": "This record has already been submitted."},
            status=status.HTTP_409_CONFLICT,
        )

    payload = RecordWriteSerializer(data=request.data)
    payload.is_valid(raise_exception=True)

    schema = load_schema(record.schema_key, record.schema_version)
    answers = _apply(record, schema, payload.validated_data)

    errors = validate(schema, answers)
    if errors:
        record.save()
        _save_attendances(record, payload.validated_data.get("attendances", []))
        return Response({"errors": errors}, status=status.HTTP_400_BAD_REQUEST)

    unfinished = _unfinished_attachment(record)
    if unfinished is not None:
        record.save()
        _save_attendances(record, payload.validated_data.get("attendances", []))
        return Response(
            {
                "detail": f"{attachment_label(unfinished)} is not submitted yet. "
                "Submit it or discard it, then submit this record."
            },
            status=status.HTTP_400_BAD_REQUEST,
        )

    record.status = RecordStatus.SUBMITTED
    record.submitted_by = request.user
    record.submitted_at = timezone.now()
    record.save()
    _save_attendances(record, payload.validated_data.get("attendances", []))

    build_record_document(record)
    AuditEvent.objects.create(
        actor=request.user,
        action=AuditEvent.Action.SUBMIT,
        target=record.reference,
        detail={"participant": record.participant.full_name},
    )
    return Response(CareRecordDetailSerializer(record).data, status=status.HTTP_200_OK)


@api_view(["POST"])
def record_not_required(request, pk=None):
    participant = get_object_or_404(
        Participant.objects.visible_to(request.user).active(),
        pk=request.data.get("participant"),
    )
    reason = (request.data.get("reason") or "").strip()
    if not reason:
        return Response(
            {"errors": {"reason": "A reason is needed before a shift can be marked not required."}},
            status=status.HTTP_400_BAD_REQUEST,
        )

    shift, service_date = current_shift()
    key, version = DEFAULT_SCHEMA
    record, _created = CareRecord.objects.get_or_create(
        participant=participant,
        service_date=service_date,
        shift=shift,
        schema_key=key,
        defaults={
            "home": participant.home,
            "schema_version": version,
            "created_by": request.user,
        },
    )
    if record.is_locked:
        return Response(
            {"detail": "That record has already been submitted."},
            status=status.HTTP_409_CONFLICT,
        )

    record.status = RecordStatus.NOT_REQUIRED
    record.not_required_reason = reason
    record.save()
    return Response(CareRecordDetailSerializer(record).data)


# Files ----------------------------------------------------------------------


@api_view(["GET"])
def record_pdf(request, pk):
    record = get_object_or_404(CareRecord.objects.visible_to(request.user), pk=pk)
    document = getattr(record, "document", None)
    if document is None:
        raise Http404("No PDF has been generated for this record.")

    inline = request.query_params.get("inline") == "1"
    AuditEvent.objects.create(
        actor=request.user,
        action=AuditEvent.Action.VIEW if inline else AuditEvent.Action.DOWNLOAD,
        target=record.reference,
        detail={"pdf": "preview"} if inline else {},
    )
    return FileResponse(
        document.file.open("rb"),
        content_type="application/pdf",
        as_attachment=not inline,
        filename=f"{record.reference}.pdf",
    )


@api_view(["GET"])
def participant_book(request, pk):
    """The participant's book, optionally narrowed to ?since= and ?until= dates."""
    participant = get_object_or_404(Participant.objects.visible_to(request.user), pk=pk)

    try:
        since = _as_date(request.query_params.get("since"))
        until = _as_date(request.query_params.get("until"))
    except ValueError:
        return Response(
            {"detail": "Dates must be written as YYYY-MM-DD."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    if since and until and since > until:
        return Response(
            {"detail": "The start date is after the end date."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    pdf_bytes, pages = build_participant_book(participant, since=since, until=until)
    if not pages:
        detail = f"{participant.full_name} has no submitted records yet."
        if since or until:
            detail = f"{participant.full_name} has no submitted records in that date range."
        return Response({"detail": detail}, status=status.HTTP_404_NOT_FOUND)

    AuditEvent.objects.create(
        actor=request.user,
        action=AuditEvent.Action.DOWNLOAD,
        target=f"book:{participant.pk}",
        detail={
            "pages": pages,
            "since": since.isoformat() if since else None,
            "until": until.isoformat() if until else None,
        },
    )
    response = HttpResponse(pdf_bytes, content_type="application/pdf")
    slug = participant.full_name.replace(" ", "-").lower()
    response["Content-Disposition"] = f'attachment; filename="record-book-{slug}.pdf"'
    return response


# Notices --------------------------------------------------------------------


@api_view(["GET"])
def notice_list(request):
    home = None if _is_manager(request.user) else _active_home(request)
    notices = list(
        Notice.objects.published().for_home(home).select_related("author__staff_profile")
    )
    read_ids = set(
        NoticeRead.objects.filter(user=request.user, notice__in=notices).values_list(
            "notice_id", flat=True
        )
    )
    unread_ids = {n.pk for n in notices} - read_ids
    data = NoticeSerializer(notices, many=True, context={"unread_ids": unread_ids}).data
    return Response({"unread_count": len(unread_ids), "results": data})


@api_view(["POST"])
def notice_mark_read(request):
    ids = request.data.get("ids")
    notices = Notice.objects.published()
    if ids:
        notices = notices.filter(pk__in=ids)
    NoticeRead.objects.bulk_create(
        [NoticeRead(notice=n, user=request.user) for n in notices], ignore_conflicts=True
    )
    return Response({"read": notices.count()})


# Dashboards -----------------------------------------------------------------


@api_view(["GET"])
def dashboard(request):
    """One endpoint, shaped by role - the same split the HTML dashboards use."""
    shift, service_date = current_shift()
    base = {
        "shift": {"key": shift, "label": shift_label(shift), "service_date": service_date},
        "is_manager": _is_manager(request.user),
    }

    if _is_manager(request.user):
        by_property, outstanding = [], []
        done = expected = 0
        for home in request.available_homes:
            rows = shift_rows(home, service_date, shift)
            home_done = sum(1 for r in rows if r["is_done"])
            done += home_done
            expected += len(rows)
            by_property.append(
                {
                    "home": HomeSerializer(home).data | {"participant_count": len(rows)},
                    "done": home_done,
                    "total": len(rows),
                    "pct": round(home_done / len(rows) * 100) if rows else 0,
                }
            )
            outstanding.extend(
                {
                    "participant": ParticipantListSerializer(r["participant"]).data,
                    "state": r["state"],
                }
                for r in rows
                if not r["is_done"]
            )

        week_start = service_date - dt.timedelta(days=6)
        recent = (
            CareRecord.objects.visible_to(request.user)
            .exclude(status=RecordStatus.DRAFT)
            .select_related("participant", "home", "submitted_by__staff_profile", "created_by")
            .prefetch_related("attachments")
            .order_by("-submitted_at")[:8]
        )
        return Response(
            base
            | {
                "compliance_pct": round(done / expected * 100) if expected else 0,
                "done_count": done,
                "expected_count": expected,
                "outstanding_count": expected - done,
                "week_count": CareRecord.objects.visible_to(request.user)
                .filter(service_date__gte=week_start, status=RecordStatus.SUBMITTED)
                .count(),
                "participant_count": Participant.objects.visible_to(request.user).active().count(),
                "workers_on_shift": User.objects.filter(
                    records_submitted__service_date=service_date,
                    records_submitted__shift=shift,
                )
                .distinct()
                .count(),
                "by_property": by_property,
                "outstanding": outstanding[:8],
                "recent": CareRecordListSerializer(recent, many=True).data,
            }
        )

    home = _active_home(request)
    rows = shift_rows(home, service_date, shift)
    done = sum(1 for r in rows if r["is_done"])

    prev_shift, prev_date = previous_shift(shift, service_date)
    handover = (
        CareRecord.objects.filter(
            home=home, service_date=prev_date, shift=prev_shift, status=RecordStatus.SUBMITTED
        )
        .select_related("participant", "home", "submitted_by__staff_profile", "created_by")
        .prefetch_related("attachments")
        .order_by("participant__first_name")[:6]
        if home
        else CareRecord.objects.none()
    )

    return Response(
        base
        | {
            "home": HomeSerializer(home).data if home else None,
            "done_count": done,
            "total_count": len(rows),
            "outstanding_count": len(rows) - done,
            "progress_pct": round(done / len(rows) * 100) if rows else 0,
            "rows": [
                {
                    "participant": ParticipantListSerializer(r["participant"]).data,
                    "state": r["state"],
                    "is_done": r["is_done"],
                    "record": r["record"].pk if r["record"] else None,
                }
                for r in rows
            ],
            "handover": {
                "shift_label": shift_label(prev_shift),
                "service_date": prev_date,
                "records": CareRecordListSerializer(handover, many=True).data,
            },
        }
    )


@api_view(["GET"])
def properties(request):
    """Each home with its participant count, staff count and shift completion."""
    from django.db.models import Count, Q

    shift, service_date = current_shift()
    homes = request.available_homes.annotate(
        participants_total=Count(
            "participants", filter=Q(participants__is_active=True), distinct=True
        ),
        staff_total=Count("staff", distinct=True),
    ).order_by("position", "name")

    rows = []
    for home in homes:
        shift_data = shift_rows(home, service_date, shift)
        done = sum(1 for row in shift_data if row["is_done"])
        rows.append(
            {
                "id": home.pk,
                "name": home.name,
                "label": home.label,
                "address": home.address,
                "participant_count": home.participants_total,
                "staff_count": home.staff_total,
                "done": done,
                "total": len(shift_data),
                "pct": round(done / len(shift_data) * 100) if shift_data else 0,
            }
        )
    return Response({"shift_label": shift_label(shift), "results": rows})


@api_view(["GET"])
def shifts(request):
    shift, service_date = current_shift()
    return Response(
        {
            "current": {"key": shift, "label": shift_label(shift), "service_date": service_date},
            "choices": [{"key": k, "label": v} for k, v in Shift.choices],
        }
    )


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def workers(request):
    if not _is_manager(request.user):
        return Response({"detail": "Managers only."}, status=status.HTTP_403_FORBIDDEN)
    rows = (
        User.objects.filter(staff_profile__isnull=False)
        .select_related("staff_profile")
        .prefetch_related("staff_profile__homes")
        .distinct()
        .order_by("first_name", "last_name")
    )
    return Response(
        [
            {
                "id": u.pk,
                "full_name": u.get_full_name() or u.username,
                "initials": u.staff_profile.initials,
                "role": u.staff_profile.role,
                "is_manager": u.staff_profile.is_manager,
                "homes": [{"id": h.pk, "label": h.label} for h in u.staff_profile.homes.all()],
            }
            for u in rows
        ]
    )


# Attached forms -------------------------------------------------------------


def _attachment(request, pk):
    return get_object_or_404(
        AttachedForm.objects.filter(
            record__in=CareRecord.objects.visible_to(request.user)
        ).select_related(
            "record__participant", "created_by__staff_profile", "submitted_by__staff_profile"
        ),
        pk=pk,
    )


def _attachment_locked():
    return Response(
        {"detail": "The care record this belongs to is submitted, so it can no longer change."},
        status=status.HTTP_409_CONFLICT,
    )


@api_view(["POST"])
def attachment_create(request, pk):
    record = get_object_or_404(CareRecord.objects.visible_to(request.user), pk=pk)
    if not record.is_editable:
        return Response(
            {"detail": "This record is submitted, so nothing more can be added to it."},
            status=status.HTTP_409_CONFLICT,
        )

    schema = attachable_schema(str(request.data.get("schema") or ""))
    if schema is None:
        return Response(
            {"detail": "That form cannot be added to a care record."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        with transaction.atomic():
            last = record.attachments.filter(schema_key=schema["key"]).aggregate(Max("position"))[
                "position__max"
            ]
            attachment = AttachedForm.objects.create(
                record=record,
                schema_key=schema["key"],
                schema_version=schema["version"],
                position=(last or 0) + 1,
                answers=prefilled_answers(schema, request.user),
                created_by=request.user,
            )
    except IntegrityError:
        return Response(
            {"detail": "Another one was added at the same moment. Please try again."},
            status=status.HTTP_409_CONFLICT,
        )
    return Response(AttachedFormSerializer(attachment).data, status=status.HTTP_201_CREATED)


@api_view(["GET", "DELETE"])
def attachment_detail(request, pk):
    attachment = _attachment(request, pk)
    if request.method == "DELETE":
        if not attachment.is_editable:
            return _attachment_locked()
        attachment.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
    return Response(AttachedFormSerializer(attachment).data)


def _write_attachment(request, attachment):
    payload = AttachmentWriteSerializer(data=request.data)
    payload.is_valid(raise_exception=True)
    schema = load_schema(attachment.schema_key, attachment.schema_version)
    answers = clean_answers(schema, payload.validated_data["answers"])
    if answers != attachment.answers:
        attachment.status = AttachmentStatus.DRAFT
        attachment.submitted_by = None
        attachment.submitted_at = None
    attachment.answers = answers
    return schema, answers


@api_view(["PATCH"])
def attachment_save_draft(request, pk):
    attachment = _attachment(request, pk)
    if not attachment.is_editable:
        return _attachment_locked()
    _write_attachment(request, attachment)
    attachment.save()
    return Response(AttachedFormSerializer(attachment).data)


@api_view(["POST"])
def attachment_submit(request, pk):
    attachment = _attachment(request, pk)
    if not attachment.is_editable:
        return _attachment_locked()

    schema, answers = _write_attachment(request, attachment)
    errors = validate(schema, answers)
    if errors:
        attachment.status = AttachmentStatus.DRAFT
        attachment.save()
        return Response({"errors": errors}, status=status.HTTP_400_BAD_REQUEST)

    if attachment.status != AttachmentStatus.SUBMITTED:
        attachment.status = AttachmentStatus.SUBMITTED
        attachment.submitted_by = request.user
        attachment.submitted_at = timezone.now()
    attachment.save()
    AuditEvent.objects.create(
        actor=request.user,
        action=AuditEvent.Action.SUBMIT,
        target=f"{attachment.record.reference} {attachment_label(attachment)}",
    )
    return Response(AttachedFormSerializer(attachment).data)
