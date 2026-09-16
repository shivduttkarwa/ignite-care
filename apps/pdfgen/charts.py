"""Builds the printed grid for a chart that attaches to a daily record.

The grid follows the paper chart: one label column and a fixed number of event
columns, so a manager reads the printout the way they read the folder.
"""

from apps.records.attachments import display_value
from apps.records.schema import find_field, load_schema

TICK = "✓"
SKIP_TYPES = {"notice", "repeater"}
DASH = {"text": "–", "muted": True}


def chart_pages(record, attachments):
    groups = {}
    for attachment in attachments:
        groups.setdefault((attachment.schema_key, attachment.schema_version), []).append(attachment)

    day = f"{record.service_date.day} {record.service_date:%b}"
    pages = []
    for (key, version), items in groups.items():
        schema = load_schema(key, version)
        width = schema.get("pdf_columns", 7)
        for start in range(0, len(items), width):
            chunk = items[start : start + width]
            pages.append(
                {
                    "template": f"pdf/{key}_{version}.html",
                    "schema": schema,
                    "span": width + 1,
                    "columns": range(width),
                    "name": record.participant.full_name,
                    "dates": _pad([{"text": day} for _ in chunk], width),
                    "rows": chart_rows(schema, chunk, width),
                }
            )
    return pages


def chart_rows(schema, items, width):
    rows = []
    for section in schema["sections"]:
        if section.get("pdf_bar_before"):
            rows.append({"kind": "bar"})
        if section.get("pdf_row") == "signoff":
            rows.append(_signoff(section, items, width))
            continue
        if section.get("pdf_heading", True):
            rows.append(_heading(schema, section, items, width))
        for field in section["fields"]:
            rows.extend(_field_rows(field, items, width))
    return rows


def _pad(cells, width, filler=None):
    filler = filler or {"text": ""}
    return list(cells) + [dict(filler) for _ in range(width - len(cells))]


def _heading(schema, section, items, width):
    key = section.get("pdf_heading_values")
    cells = []
    blank = {"text": section.get("pdf_heading_blank", "")}
    if key:
        field = find_field(schema, key) or {}
        cells = [
            {"text": display_value(field, item.answers.get(key)) or blank["text"]} for item in items
        ]
    return {
        "kind": "heading",
        "label": section["title"],
        "tone": section.get("pdf_heading_tone", ""),
        "cells": _pad(cells, width, blank if key else None),
    }


def _field_rows(field, items, width):
    if field.get("pdf_skip") or field["type"] in SKIP_TYPES:
        return []

    if field["type"] == "checks" and not field.get("pdf_combine"):
        return [
            {
                "kind": "row",
                "label": option["label"],
                "cells": _pad(
                    [
                        {
                            "text": TICK
                            if option["key"] in (item.answers.get(field["key"]) or [])
                            else ""
                        }
                        for item in items
                    ],
                    width,
                ),
            }
            for option in field["options"]
        ]

    return [
        {
            "kind": "row",
            "label": field.get("pdf_label", field["label"]),
            "shaded": field.get("pdf_shaded", False),
            "cells": _pad([_cell(field, item) for item in items], width),
        }
    ]


def _cell(field, item):
    value = item.answers.get(field["key"])

    if field["type"] == "yesno":
        if value is None:
            return DASH
        cell = {"text": "YES" if value else "NO", "strong": True}
        detail = item.answers.get(field.get("pdf_detail", ""))
        if value and detail:
            cell["detail"] = detail
        return cell

    if field["type"] == "checks":
        chosen = [o["label"] for o in field["options"] if o["key"] in (value or [])]
        return {"text": " + ".join(chosen)}

    if field["type"] == "signature":
        if not value:
            return DASH
        if value.get("mode") == "drawn":
            return {"image": value["data"]}
        return {"text": value.get("name", "")}

    text = display_value(field, value)
    if not text:
        return DASH
    return {"text": text, "strong": field.get("pdf_strong", False)}


def _signoff(section, items, width):
    cells = []
    for item in items:
        signature = item.answers.get(section["pdf_signature"]) or {}
        drawn = signature.get("mode") == "drawn"
        cells.append(
            {
                "name": item.answers.get(section["pdf_name"]) or "",
                "image": signature.get("data", "") if drawn else "",
                "typed": "" if drawn else signature.get("name", ""),
            }
        )
    return {
        "kind": "signoff",
        "labels": section.get("pdf_labels", []),
        "cells": _pad(cells, width, {"name": "", "image": "", "typed": ""}),
    }
