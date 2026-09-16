from apps.records.attachments import display_value
from apps.records.schema import load_schema

TICK = "✓"
NOT_RECORDED = {"text": "Not recorded", "muted": True}


def chart_pages(record, attachments):
    groups = {}
    for attachment in attachments:
        groups.setdefault((attachment.schema_key, attachment.schema_version), []).append(attachment)

    pages = []
    for (key, version), items in groups.items():
        schema = load_schema(key, version)
        width = schema.get("pdf_columns", 3)
        for start in range(0, len(items), width):
            pages.append(
                {
                    "template": f"pdf/{key}_{version}.html",
                    "schema": schema,
                    "span": width + 1,
                    "rows": chart_rows(record, schema, items[start : start + width], width),
                }
            )
    return pages


def chart_rows(record, schema, items, width):
    def pad(cells):
        return cells + [{"text": ""}] * (width - len(cells))

    day = f"{record.service_date.day} {record.service_date:%b}"
    rows = [
        {
            "kind": "key",
            "label": "DATE",
            "cells": pad([{"text": day, "strong": True} for _ in items]),
        }
    ]
    for section in schema["sections"]:
        if section.get("pdf_heading", True):
            rows.append({"kind": "heading", "label": section["title"]})
        for field in section["fields"]:
            rows.extend(_field_rows(field, items, pad))
    return rows


def _field_rows(field, items, pad):
    key = field["key"]
    if field["type"] == "notice":
        return []
    if field["type"] == "timer":
        return [
            {
                "kind": "key",
                "label": field.get("pdf_label", field["label"]),
                "cells": pad([{"text": item.answers.get(key) or ""} for item in items]),
            }
        ]
    if field["type"] == "checks":
        return [
            {
                "kind": "row",
                "label": option["label"],
                "cells": pad(
                    [
                        {"text": TICK if option["key"] in (item.answers.get(key) or []) else ""}
                        for item in items
                    ]
                ),
            }
            for option in field["options"]
        ]
    return [
        {
            "kind": "row",
            "label": field.get("pdf_label", field["label"]),
            "label_strong": field.get("pdf_label_strong", False),
            "cells": pad([_cell(field, item.answers.get(key)) for item in items]),
        }
    ]


def _cell(field, value):
    if field["type"] == "yesno":
        if value is None:
            return NOT_RECORDED
        return {"text": "YES" if value else "NO", "strong": True}
    if field["type"] == "signature":
        if not value:
            return NOT_RECORDED
        if value.get("mode") == "drawn":
            return {"image": value["data"], "signature": True}
        return {"text": value.get("name", ""), "signature": True}
    text = display_value(field, value)
    if not text:
        return NOT_RECORDED
    return {"text": text, "strong": field.get("pdf_strong", False)}
