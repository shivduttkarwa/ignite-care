"""Renders a record to PDF once, at submission, and compiles participant books.

A record's PDF is never regenerated. If a form template changes later, an old
record must still print exactly as it was signed.
"""

import hashlib
import io
import os
import sys

from django.conf import settings
from django.core.files.base import ContentFile
from django.template.loader import render_to_string

from apps.records.models import CareRecord, RecordStatus
from apps.records.schema import load_schema

_DLL_READY = False


def _prepare_weasyprint():
    """WeasyPrint needs the GTK DLLs on the search path on Windows."""
    global _DLL_READY
    if _DLL_READY:
        return
    dll_dir = getattr(settings, "WEASYPRINT_DLL_DIR", "")
    if sys.platform == "win32" and dll_dir and os.path.isdir(dll_dir):
        os.add_dll_directory(dll_dir)
        os.environ["PATH"] = dll_dir + os.pathsep + os.environ.get("PATH", "")
    _DLL_READY = True


def html_to_pdf(html: str, base_url=None) -> bytes:
    _prepare_weasyprint()
    from weasyprint import HTML

    return HTML(string=html, base_url=base_url or str(settings.BASE_DIR)).write_pdf()


def render_record_html(record: CareRecord) -> str:
    schema = load_schema(record.schema_key, record.schema_version)
    template = f"pdf/{record.schema_key}_{record.schema_version}.html"
    return render_to_string(
        template,
        {
            "record": record,
            "participant": record.participant,
            "schema": schema,
            "attendances": record.attendances.all(),
            "organisation_name": settings.ORGANISATION_NAME,
            "static_root": settings.BASE_DIR / "static",
        },
    )


def build_record_document(record: CareRecord):
    """Render and store the PDF for a submitted record. Idempotent."""
    from .models import RecordDocument

    existing = getattr(record, "document", None)
    if existing is not None:
        return existing

    pdf_bytes = html_to_pdf(render_record_html(record))
    digest = hashlib.sha256(pdf_bytes).hexdigest()

    document = RecordDocument(
        record=record,
        sha256=digest,
        page_count=_count_pages(pdf_bytes),
    )
    document.file.save(f"{record.reference}.pdf", ContentFile(pdf_bytes), save=False)
    document.save()
    return document


def _count_pages(pdf_bytes: bytes) -> int:
    from pypdf import PdfReader

    return len(PdfReader(io.BytesIO(pdf_bytes)).pages)


def build_participant_book(participant, since=None, until=None) -> tuple[bytes, int]:
    """Concatenate every stored record PDF for one participant, oldest first.

    The book is assembled from the artefacts stored at submission, never
    re-rendered, so history cannot shift under the client's feet.
    """
    from pypdf import PdfWriter

    records = (
        CareRecord.objects.filter(participant=participant, status=RecordStatus.SUBMITTED)
        .select_related("document")
        .order_by("service_date", "submitted_at")
    )
    if since:
        records = records.filter(service_date__gte=since)
    if until:
        records = records.filter(service_date__lte=until)

    writer = PdfWriter()
    pages = 0
    for record in records:
        document = getattr(record, "document", None)
        if document is None:
            continue
        with document.file.open("rb") as handle:
            writer.append(io.BytesIO(handle.read()))
        pages += document.page_count

    if not pages:
        return b"", 0

    buffer = io.BytesIO()
    writer.write(buffer)
    return buffer.getvalue(), pages


def build_selection_pdf(records) -> tuple[bytes, int]:
    """One PDF from an arbitrary admin selection, in date order."""
    from pypdf import PdfWriter

    writer = PdfWriter()
    pages = 0
    for record in sorted(records, key=lambda r: (r.service_date, r.submitted_at or r.created_at)):
        document = getattr(record, "document", None)
        if document is None:
            continue
        with document.file.open("rb") as handle:
            writer.append(io.BytesIO(handle.read()))
        pages += document.page_count

    if not pages:
        return b"", 0

    buffer = io.BytesIO()
    writer.write(buffer)
    return buffer.getvalue(), pages
