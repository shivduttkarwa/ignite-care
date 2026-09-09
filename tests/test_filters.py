"""Gap 1 - the reportable fields must be filterable, not just visible.

The client asked for "a report of this participant's bowel activity for the
last month", so these are the tests that keep that answerable.
"""

import datetime as dt
from pathlib import Path

import pytest
from django.urls import reverse

from apps.records.filters import RECORDED_FIELDS, TRISTATE_FIELDS
from apps.records.models import CareRecord, RecordStatus, Shift


def _submitted(participant, author, day, **flags):
    defaults = dict(physio_completed=None, shower=None, bowel_recorded=False, urine_recorded=False)
    defaults.update(flags)
    return CareRecord.objects.create(
        participant=participant,
        home=participant.home,
        service_date=day,
        shift=Shift.NIGHT,
        answers={},
        status=RecordStatus.SUBMITTED,
        created_by=author,
        submitted_by=author,
        **defaults,
    )


@pytest.fixture
def three_records(db, daniel, worker):
    today = dt.date.today()
    return {
        "physio_yes": _submitted(daniel, worker, today, physio_completed=True, bowel_recorded=True),
        "physio_no": _submitted(
            daniel, worker, today - dt.timedelta(days=1), physio_completed=False
        ),
        "physio_blank": _submitted(daniel, worker, today - dt.timedelta(days=2)),
    }


@pytest.mark.parametrize(
    ("params", "expected"),
    [
        ({"physio": "yes"}, {"physio_yes"}),
        ({"physio": "no"}, {"physio_no"}),
        ({"physio": "blank"}, {"physio_blank"}),
        ({"bowel": "yes"}, {"physio_yes"}),
        ({"bowel": "no"}, {"physio_no", "physio_blank"}),
        ({}, {"physio_yes", "physio_no", "physio_blank"}),
    ],
)
def test_manager_can_filter_by_the_reportable_fields(
    client, manager, three_records, params, expected
):
    client.force_login(manager)
    body = client.get(reverse("api:record-list"), params).json()
    shown = {row["id"] for row in body["results"]}
    assert shown == {three_records[key].pk for key in expected}


def test_the_export_carries_the_same_rows_as_the_screen(client, manager, three_records):
    """A manager filters, then exports. The spreadsheet must match what they saw."""
    client.force_login(manager)
    for params in ({"physio": "yes"}, {"bowel": "no"}, {"shower": "blank"}):
        on_screen = client.get(reverse("api:record-list"), params).json()["count"]
        csv_rows = client.get(reverse("api:export-csv"), params).content.decode().splitlines()
        assert len(csv_rows) - 1 == on_screen, params


def test_the_records_screen_offers_every_server_side_filter():
    """The screen and the filter module have to list the same fields."""
    source = Path("frontend/src/screens/Records.tsx").read_text(encoding="utf-8")
    for key in list(TRISTATE_FIELDS) + list(RECORDED_FIELDS):
        assert f'"{key}"' in source, f"the Records screen has no control for {key}"


def test_participant_search_filters_the_list(client, worker, daniel):
    client.force_login(worker)
    hit = client.get(reverse("api:participant-list"), {"q": "Daniel"}).json()
    assert [p["full_name"] for p in hit] == ["Daniel Reeves"]

    assert client.get(reverse("api:participant-list"), {"q": "Zebedee"}).json() == []
