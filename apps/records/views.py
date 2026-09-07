import json

from django.contrib import messages
from django.contrib.auth.decorators import login_required
from django.http import FileResponse, Http404, HttpResponse
from django.shortcuts import get_object_or_404, redirect, render
from django.utils import timezone
from django.views.decorators.http import require_POST

from apps.people.models import Participant

from .models import AuditEvent, CareRecord, OvernightAttendance, RecordStatus
from .schema import coerce, is_visible, iter_fields, load_schema, promoted_values, validate
from .services import current_shift, shift_label

DEFAULT_SCHEMA = ("daily_care", "v02")


def _parse_answers(schema, post):
    answers = {}
    for _section, field in iter_fields(schema):
        if field["type"] == "repeater":
            continue
        answers[field["key"]] = coerce(field, post.get(field["key"]))
    # Drop answers to questions the rules currently hide, so a stale value from
    # an earlier pass cannot end up in the record.
    for _section, field in iter_fields(schema):
        if field["type"] != "repeater" and not is_visible(field, answers):
            answers[field["key"]] = None
    return answers


def _parse_attendances(post):
    times = post.getlist("attendance_time")
    purposes = post.getlist("attendance_purpose")
    durations = post.getlist("attendance_duration")
    rows = []
    for time_value, purpose, duration in zip(times, purposes, durations, strict=False):
        if not (time_value and purpose):
            continue
        try:
            minutes = int(duration or 0)
        except ValueError:
            minutes = 0
        rows.append({"time": time_value, "purpose": purpose.strip(), "duration_minutes": minutes})
    return rows


@login_required
def record_new(request, participant_id):
    participant = get_object_or_404(
        Participant.objects.visible_to(request.user).active(), pk=participant_id
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
            "answers": {},
        },
    )
    if record.is_locked:
        return redirect("record_detail", pk=record.pk)
    return redirect("record_edit", pk=record.pk)


@login_required
def record_edit(request, pk):
    record = get_object_or_404(
        CareRecord.objects.visible_to(request.user).select_related("participant", "home"), pk=pk
    )
    if record.is_locked:
        return redirect("record_detail", pk=record.pk)

    schema = load_schema(record.schema_key, record.schema_version)
    errors = {}

    if request.method == "POST":
        intent = request.POST.get("intent", "draft")
        answers = _parse_answers(schema, request.POST)
        attendances = _parse_attendances(request.POST)

        record.answers = answers
        for column, value in promoted_values(schema, answers).items():
            setattr(record, column, value)

        if intent == "submit":
            errors = validate(schema, answers)
            if not errors:
                record.status = RecordStatus.SUBMITTED
                record.submitted_by = request.user
                record.submitted_at = timezone.now()

        record.save()
        record.attendances.all().delete()
        OvernightAttendance.objects.bulk_create(
            [OvernightAttendance(record=record, **row) for row in attendances]
        )

        if intent == "submit" and not errors:
            from apps.pdfgen.render import build_record_document

            build_record_document(record)
            AuditEvent.objects.create(
                actor=request.user,
                action=AuditEvent.Action.SUBMIT,
                target=record.reference,
                detail={"participant": record.participant.full_name},
            )
            messages.success(request, f"Record submitted for {record.participant.full_name}.")
            return redirect("record_detail", pk=record.pk)

        if intent == "draft":
            messages.success(request, "Draft saved.")
            return redirect("record_edit", pk=record.pk)

    attendance_rows = [
        {
            "time": row.time.strftime("%H:%M"),
            "purpose": row.purpose,
            "duration_minutes": row.duration_minutes,
        }
        for row in record.attendances.all()
    ]

    return render(
        request,
        "records/record_form.html",
        {
            "record": record,
            "participant": record.participant,
            "schema": schema,
            "schema_json": json.dumps(schema),
            "answers_json": json.dumps(record.answers or {}),
            "attendances_json": json.dumps(attendance_rows),
            "errors": errors,
            "shift_label": shift_label(record.shift),
        },
    )


@login_required
def record_detail(request, pk):
    record = get_object_or_404(
        CareRecord.objects.visible_to(request.user).select_related(
            "participant", "home", "submitted_by"
        ),
        pk=pk,
    )
    schema = load_schema(record.schema_key, record.schema_version)
    AuditEvent.objects.create(
        actor=request.user, action=AuditEvent.Action.VIEW, target=record.reference
    )
    return render(
        request,
        "records/record_detail.html",
        {
            "record": record,
            "participant": record.participant,
            "schema": schema,
            "attendances": record.attendances.all(),
            "shift_label": shift_label(record.shift),
        },
    )


@login_required
@require_POST
def record_not_required(request, participant_id):
    participant = get_object_or_404(
        Participant.objects.visible_to(request.user).active(), pk=participant_id
    )
    reason = request.POST.get("reason", "").strip()
    if not reason:
        messages.error(request, "A reason is needed before a shift can be marked not required.")
        return redirect("dashboard")

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
        messages.error(request, "That record has already been submitted.")
        return redirect("dashboard")

    record.status = RecordStatus.NOT_REQUIRED
    record.not_required_reason = reason
    record.save()
    messages.success(request, f"Marked not required for {participant.full_name}.")
    return redirect("dashboard")


@login_required
def record_pdf(request, pk):
    record = get_object_or_404(CareRecord.objects.visible_to(request.user), pk=pk)
    document = getattr(record, "document", None)
    if document is None:
        raise Http404("No PDF has been generated for this record.")

    AuditEvent.objects.create(
        actor=request.user, action=AuditEvent.Action.DOWNLOAD, target=record.reference
    )
    return FileResponse(
        document.file.open("rb"),
        content_type="application/pdf",
        as_attachment=True,
        filename=f"{record.reference}.pdf",
    )


@login_required
def participant_book(request, pk):
    from apps.pdfgen.render import build_participant_book

    participant = get_object_or_404(Participant.objects.visible_to(request.user), pk=pk)
    pdf_bytes, page_count = build_participant_book(participant)
    if not page_count:
        messages.info(request, f"{participant.full_name} has no submitted records yet.")
        return redirect("participant_detail", pk=participant.pk)

    AuditEvent.objects.create(
        actor=request.user,
        action=AuditEvent.Action.DOWNLOAD,
        target=f"book:{participant.pk}",
        detail={"pages": page_count},
    )
    response = HttpResponse(pdf_bytes, content_type="application/pdf")
    slug = participant.full_name.replace(" ", "-").lower()
    response["Content-Disposition"] = f'attachment; filename="record-book-{slug}.pdf"'
    return response
