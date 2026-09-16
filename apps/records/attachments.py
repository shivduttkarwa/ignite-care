import re

from .models import AttachmentStatus
from .schema import find_field, load_schema

DURATION = re.compile(
    r"^\s*(?:(\d+)\s*(?:m|mins?|minutes?)\b)?\s*(?:(\d+)\s*(?:s|secs?|seconds?)\b)?\s*$",
    re.IGNORECASE,
)


def compact_duration(text):
    match = DURATION.match(text or "")
    if not match or not any(match.groups()):
        return text or ""
    minutes, seconds = match.groups()
    parts = []
    if minutes:
        parts.append(f"{int(minutes)}m")
    if seconds:
        parts.append(f"{int(seconds)}s")
    return " ".join(parts)


def schema_for(attachment):
    return load_schema(attachment.schema_key, attachment.schema_version)


def display_value(field, value):
    if value in (None, "", []):
        return ""
    if field.get("pdf_format") == "duration":
        return compact_duration(str(value))
    return str(value)


def attachment_label(attachment):
    return f"{schema_for(attachment).get('item_label', 'Form')} {attachment.position}"


def attachment_description(attachment):
    schema = schema_for(attachment)
    parts = []
    for key in schema.get("describe", []):
        field = find_field(schema, key)
        text = display_value(field, attachment.answers.get(key)) if field else ""
        if text:
            parts.append(text)
    return " · ".join(parts)


def submitted(attachments):
    return [a for a in attachments if a.status == AttachmentStatus.SUBMITTED]


def summary_parts(record):
    groups = {}
    for attachment in submitted(record.attachments.all()):
        groups.setdefault(attachment.schema_key, []).append(attachment)

    parts = []
    for items in groups.values():
        schema = schema_for(items[0])
        singular, plural = schema.get("count_label", ["form", "forms"])
        text = f"{len(items)} {singular if len(items) == 1 else plural}"
        headline = schema.get("headline")
        if len(items) == 1 and headline:
            detail = display_value(
                find_field(schema, headline) or {}, items[0].answers.get(headline)
            )
            if detail:
                text = f"{text}, {detail}"
        parts.append(text)
    return parts


def forms_for(record):
    schema = load_schema(record.schema_key, record.schema_version)
    forms = [{"key": record.schema_key, "badge": schema["badge"], "title": schema["short_title"]}]
    seen = {record.schema_key}
    for attachment in submitted(record.attachments.all()):
        if attachment.schema_key in seen:
            continue
        seen.add(attachment.schema_key)
        extra = schema_for(attachment)
        forms.append(
            {"key": attachment.schema_key, "badge": extra["badge"], "title": extra["short_title"]}
        )
    return forms


def submitted_count(record, schema_key):
    return sum(1 for a in submitted(record.attachments.all()) if a.schema_key == schema_key)
