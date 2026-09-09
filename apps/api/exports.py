"""Spreadsheet and bulk-PDF exports.

The client's stated need is to pull a month of a participant's bowel activity
into a spreadsheet, so these honour exactly the same filters as the records
screen - same module, same rows.
"""

import csv

from django.http import HttpResponse
from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.response import Response

from apps.pdfgen.render import build_selection_pdf
from apps.records.filters import base_queryset, filter_records, read_params
from apps.records.models import AuditEvent, CareRecord, RecordStatus


def _tri(value):
    if value is True:
        return "Yes"
    if value is False:
        return "No"
    return "Not recorded"


EXPORT_COLUMNS = [
    ("Date", lambda r: r.service_date.isoformat()),
    ("Shift", lambda r: r.get_shift_display()),
    ("Property", lambda r: r.home.name),
    ("Participant", lambda r: r.participant.full_name),
    ("Reference", lambda r: r.reference),
    ("Care worker", lambda r: (r.submitted_by or r.created_by).get_full_name()),
    ("Submitted", lambda r: r.submitted_at.isoformat() if r.submitted_at else ""),
    ("Physio", lambda r: _tri(r.physio_completed)),
    ("Shower", lambda r: _tri(r.shower)),
    ("Bed bath", lambda r: _tri(r.bed_bath)),
    ("Bowel", lambda r: "Recorded" if r.bowel_recorded else "Not recorded"),
    ("Urine", lambda r: "Recorded" if r.urine_recorded else "Not recorded"),
    ("Fluids", lambda r: (r.answers or {}).get("fluids", "")),
    ("Bowel detail", lambda r: (r.answers or {}).get("bowel", "")),
    ("Urine detail", lambda r: (r.answers or {}).get("urine", "")),
]


def _is_manager(user):
    profile = getattr(user, "staff_profile", None)
    return bool(user.is_superuser or (profile and profile.is_manager))


def _denied():
    return Response({"detail": "Managers only."}, status=status.HTTP_403_FORBIDDEN)


def _rows(request):
    return filter_records(base_queryset(request.user), read_params(request.query_params)).order_by(
        "service_date"
    )


def _audit(request, kind, count):
    AuditEvent.objects.create(
        actor=request.user,
        action=AuditEvent.Action.EXPORT,
        target=f"records:{kind}",
        detail={"rows": count, "filters": dict(request.query_params.items())},
    )


@api_view(["GET"])
def export_csv(request):
    if not _is_manager(request.user):
        return _denied()

    records = _rows(request)
    _audit(request, "csv", records.count())

    response = HttpResponse(content_type="text/csv")
    response["Content-Disposition"] = 'attachment; filename="ignite-records.csv"'
    writer = csv.writer(response)
    writer.writerow([name for name, _ in EXPORT_COLUMNS])
    for record in records:
        writer.writerow([fn(record) for _, fn in EXPORT_COLUMNS])
    return response


@api_view(["GET"])
def export_xlsx(request):
    if not _is_manager(request.user):
        return _denied()

    from openpyxl import Workbook
    from openpyxl.styles import Alignment, Font, PatternFill

    records = _rows(request)
    _audit(request, "xlsx", records.count())

    book = Workbook()
    sheet = book.active
    sheet.title = "Care records"

    header_fill = PatternFill("solid", fgColor="115E74")
    header_font = Font(color="FFFFFF", bold=True)
    for column, (name, _fn) in enumerate(EXPORT_COLUMNS, start=1):
        cell = sheet.cell(row=1, column=column, value=name)
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = Alignment(vertical="center")
    sheet.freeze_panes = "A2"

    for row_index, record in enumerate(records, start=2):
        for column, (_name, fn) in enumerate(EXPORT_COLUMNS, start=1):
            sheet.cell(row=row_index, column=column, value=fn(record))

    for column, (name, _fn) in enumerate(EXPORT_COLUMNS, start=1):
        letter = sheet.cell(row=1, column=column).column_letter
        sheet.column_dimensions[letter].width = max(12, min(40, len(name) + 8))

    response = HttpResponse(
        content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )
    response["Content-Disposition"] = 'attachment; filename="ignite-records.xlsx"'
    book.save(response)
    return response


@api_view(["GET"])
def export_pdf(request):
    """One PDF from a selection of records, stapled in date order."""
    if not _is_manager(request.user):
        return _denied()

    ids = request.query_params.getlist("id")
    records = list(
        CareRecord.objects.visible_to(request.user)
        .filter(pk__in=ids, status=RecordStatus.SUBMITTED)
        .select_related("document")
    )
    pdf_bytes, pages = build_selection_pdf(records)
    if not pages:
        return Response(
            {"detail": "None of the selected records have a stored PDF."},
            status=status.HTTP_404_NOT_FOUND,
        )

    _audit(request, "pdf", len(records))
    response = HttpResponse(pdf_bytes, content_type="application/pdf")
    response["Content-Disposition"] = 'attachment; filename="ignite-records.pdf"'
    return response
