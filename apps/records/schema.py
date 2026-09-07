"""Loads and interprets the versioned form schemas in forms/schemas/.

A record pins schema_key and schema_version at creation, so a record signed
under v02 keeps rendering as v02 no matter what later versions do.
"""

import functools
import json

from django.conf import settings
from django.core.exceptions import ValidationError

TRUTHY = {"true", "True", "yes", "on", "1", True}
FALSEY = {"false", "False", "no", "off", "0", False}


class SchemaNotFound(Exception):
    pass


@functools.lru_cache(maxsize=32)
def load_schema(key: str, version: str) -> dict:
    path = settings.SCHEMA_DIR / f"{key}_{version}.json"
    if not path.exists():
        raise SchemaNotFound(f"No schema at {path}")
    return json.loads(path.read_text(encoding="utf-8"))


def available_schemas() -> list[dict]:
    out = []
    for path in sorted(settings.SCHEMA_DIR.glob("*.json")):
        out.append(json.loads(path.read_text(encoding="utf-8")))
    return out


def iter_fields(schema: dict):
    for section in schema["sections"]:
        for field in section["fields"]:
            yield section, field


def find_field(schema: dict, key: str):
    for _section, field in iter_fields(schema):
        if field["key"] == key:
            return field
    return None


def coerce(field: dict, raw):
    """Turn one posted value into what belongs in the answers JSON."""
    ftype = field["type"]
    if raw is None:
        return None
    if ftype == "yesno":
        if raw in TRUTHY:
            return True
        if raw in FALSEY:
            return False
        return None
    if ftype == "number":
        text = str(raw).strip()
        if not text:
            return None
        try:
            return int(text)
        except ValueError as exc:
            raise ValidationError(f"{field['label']} must be a whole number.") from exc
    return str(raw).strip()


def is_visible(field: dict, answers: dict) -> bool:
    """Evaluate a show_if rule against the answers collected so far."""
    rule = field.get("show_if")
    if not rule:
        return True
    clauses = rule.get("all") or []
    for clause in clauses:
        value = answers.get(clause["field"])
        if "eq" in clause and value != clause["eq"]:
            return False
        if "filled" in clause and bool(value) != clause["filled"]:
            return False
    return True


def validate(schema: dict, answers: dict) -> dict[str, str]:
    """Return {field_key: message} for everything the schema says is wrong."""
    errors: dict[str, str] = {}
    for _section, field in iter_fields(schema):
        if field["type"] == "repeater":
            continue
        visible = is_visible(field, answers)
        value = answers.get(field["key"])
        blank = value is None or value == ""
        required = field.get("required") or (field.get("required_when_shown") and visible)
        if required and visible and blank:
            errors[field["key"]] = field.get("error") or f"{field['label']} is required."
    return errors


def promoted_values(schema: dict, answers: dict) -> dict:
    """Map answers onto the reportable columns on CareRecord."""
    out = {}
    for _section, field in iter_fields(schema):
        column = field.get("promote")
        if not column:
            continue
        value = answers.get(field["key"])
        if field["type"] == "yesno":
            out[column] = value if isinstance(value, bool) else None
        else:
            out[column] = bool(value)
    return out


def answered_count(section: dict, answers: dict) -> tuple[int, int]:
    """How many of a section's visible fields have an answer, for the UI counter."""
    total = 0
    filled = 0
    for field in section["fields"]:
        if not is_visible(field, answers):
            continue
        total += 1
        value = answers.get(field["key"])
        if field["type"] == "repeater":
            if value:
                filled += 1
        elif value is not None and value != "":
            filled += 1
    return filled, total


def summarise(schema: dict, answers: dict, limit: int = 4) -> list[str]:
    """The one-line summary shown on a record card."""
    parts: list[str] = []
    for rule in schema.get("summary", []):
        value = answers.get(rule["field"])
        if rule["when"] == "filled":
            if value:
                parts.append(rule["template"])
        elif isinstance(value, bool):
            parts.append(rule["template"].format(value="Yes" if value else "No"))
        if len(parts) >= limit:
            break
    return parts
