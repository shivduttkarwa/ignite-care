"""Shift arithmetic and record helpers.

A night shift that starts at 10pm on Tuesday and ends at 6am on Wednesday
belongs to Tuesday, the way it does in the paper book. service_date is
therefore the date the shift started, never the date of submission.
"""

from datetime import date, time, timedelta

from django.utils import timezone

from .models import CareRecord, RecordStatus, Shift

SHIFT_WINDOWS = {
    Shift.MORNING: (time(6, 0), time(14, 0)),
    Shift.AFTERNOON: (time(14, 0), time(22, 0)),
    Shift.NIGHT: (time(22, 0), time(6, 0)),
}


def current_shift(now=None) -> tuple[str, date]:
    """Return the shift running now and the date that shift started."""
    now = now or timezone.localtime()
    clock = now.time()
    today = now.date()

    if time(6, 0) <= clock < time(14, 0):
        return Shift.MORNING, today
    if time(14, 0) <= clock < time(22, 0):
        return Shift.AFTERNOON, today
    if clock >= time(22, 0):
        return Shift.NIGHT, today
    # Between midnight and 6am we are still on the previous day's night shift.
    return Shift.NIGHT, today - timedelta(days=1)


def shift_label(shift: str) -> str:
    return dict(Shift.choices).get(shift, shift)


def records_for_shift(home, service_date, shift):
    """Every record already lodged for one home on one shift, keyed by participant."""
    rows = CareRecord.objects.filter(
        home=home, service_date=service_date, shift=shift
    ).select_related("participant")
    return {row.participant_id: row for row in rows}


def shift_state(record) -> str:
    if record is None:
        return "none"
    return record.status


def progress(rows) -> tuple[int, int, int]:
    """Return (done, total, percent) where 'done' counts anything not outstanding."""
    total = len(rows)
    done = sum(1 for row in rows if row["state"] in {RecordStatus.SUBMITTED, RecordStatus.NOT_REQUIRED})
    pct = round(done / total * 100) if total else 0
    return done, total, pct


SHIFT_ORDER = [Shift.MORNING, Shift.AFTERNOON, Shift.NIGHT]


def previous_shift(shift: str, service_date: date) -> tuple[str, date]:
    """The shift immediately before this one, for the handover panel."""
    index = SHIFT_ORDER.index(shift)
    if index == 0:
        return Shift.NIGHT, service_date - timedelta(days=1)
    return SHIFT_ORDER[index - 1], service_date
