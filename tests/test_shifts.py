"""The rule the whole system rests on: which day does a shift belong to?"""

from datetime import date, datetime

import pytest
from django.utils import timezone

from apps.records.models import Shift
from apps.records.services import current_shift


def at(year, month, day, hour, minute=0):
    return timezone.make_aware(datetime(year, month, day, hour, minute))


@pytest.mark.parametrize(
    ("moment", "expected_shift", "expected_date"),
    [
        (at(2026, 8, 12, 7, 30), Shift.MORNING, date(2026, 8, 12)),
        (at(2026, 8, 12, 13, 59), Shift.MORNING, date(2026, 8, 12)),
        (at(2026, 8, 12, 14, 0), Shift.AFTERNOON, date(2026, 8, 12)),
        (at(2026, 8, 12, 21, 59), Shift.AFTERNOON, date(2026, 8, 12)),
        (at(2026, 8, 12, 22, 0), Shift.NIGHT, date(2026, 8, 12)),
        (at(2026, 8, 12, 23, 45), Shift.NIGHT, date(2026, 8, 12)),
    ],
)
def test_shift_windows(moment, expected_shift, expected_date):
    shift, service_date = current_shift(timezone.localtime(moment))
    assert shift == expected_shift
    assert service_date == expected_date


@pytest.mark.parametrize("hour", [0, 2, 5])
def test_after_midnight_still_belongs_to_yesterdays_night_shift(hour):
    """A night shift submitted at 6:02am Wednesday is Tuesday's record."""
    shift, service_date = current_shift(timezone.localtime(at(2026, 8, 13, hour)))
    assert shift == Shift.NIGHT
    assert service_date == date(2026, 8, 12)
