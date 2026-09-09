"""Record filtering, shared by the records list and the exports.

The client's stated need is "a report of this participant's bowel activity for
the last month", so the reportable columns are filterable, not just visible.
The records list and the spreadsheet exports call filter_records, so a filtered
export can never contain different rows from the screen it was taken from.
"""

import datetime as dt

from .models import CareRecord, RecordStatus

# The yellow-highlighted fields from the client's paper form, plus shower.
TRISTATE_FIELDS = {
    "physio": ("physio_completed", "Physio"),
    "shower": ("shower", "Shower"),
    "bed_bath": ("bed_bath", "Bed bath"),
}

RECORDED_FIELDS = {
    "bowel": ("bowel_recorded", "Bowel"),
    "urine": ("urine_recorded", "Urine"),
    "fluids": ("fluids_recorded", "Fluids"),
}


def base_queryset(user):
    return (
        CareRecord.objects.visible_to(user)
        .exclude(status=RecordStatus.DRAFT)
        .select_related(
            "participant", "home", "submitted_by__staff_profile", "created_by", "document"
        )
    )


def read_params(params) -> dict:
    """Pull every supported filter out of a query string, ignoring blanks."""
    selected = {
        "home": params.get("home") or "",
        "participant": params.get("participant") or "",
        "worker": params.get("worker") or "",
        "shift": params.get("shift") or "",
        "range": params.get("range") or "7",
    }
    for key in list(TRISTATE_FIELDS) + list(RECORDED_FIELDS):
        selected[key] = params.get(key) or ""
    return selected


def filter_records(records, selected: dict):
    if selected.get("home"):
        records = records.filter(home_id=selected["home"])
    if selected.get("participant"):
        records = records.filter(participant_id=selected["participant"])
    if selected.get("worker"):
        records = records.filter(submitted_by_id=selected["worker"])
    if selected.get("shift"):
        records = records.filter(shift=selected["shift"])

    window = selected.get("range") or "7"
    if window in {"7", "14", "30"}:
        since = dt.date.today() - dt.timedelta(days=int(window) - 1)
        records = records.filter(service_date__gte=since)

    # Yes / No / Not recorded, where the column is nullable.
    for key, (column, _label) in TRISTATE_FIELDS.items():
        value = selected.get(key)
        if value == "yes":
            records = records.filter(**{column: True})
        elif value == "no":
            records = records.filter(**{column: False})
        elif value == "blank":
            records = records.filter(**{f"{column}__isnull": True})

    # Recorded / Not recorded, where the column is a plain boolean.
    for key, (column, _label) in RECORDED_FIELDS.items():
        value = selected.get(key)
        if value == "yes":
            records = records.filter(**{column: True})
        elif value == "no":
            records = records.filter(**{column: False})

    return records
