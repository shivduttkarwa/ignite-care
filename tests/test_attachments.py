"""The Seizure Observation Chart, attached to a daily care record."""

import datetime as dt

import pytest
from django.urls import reverse

from apps.records.attachments import compact_duration
from apps.records.models import (
    AttachedForm,
    AttachmentStatus,
    AuditEvent,
    CareRecord,
    RecordStatus,
    Shift,
)
from apps.records.schema import (
    clean_answers,
    coerce,
    find_field,
    has_content,
    load_schema,
    validate,
)

from .test_api import ANSWERS

SEIZURE = load_schema("seizure_observation", "v02")

SEIZURE_ANSWERS = {
    "start_time": "14:20",
    "awareness": ["confused", "not_a_real_option"],
    "facial_expressions": ["staring_blank"],
    "falls": "true",
    "seizure_length": "2 min 10 sec",
    "person_injured": "false",
    "injury_details": "Typed before changing the answer",
    "observer_name": "Karen Mitchell",
    "signature": {"mode": "typed", "name": "K. Mitchell", "signed_at": "2026-08-12T14:24:00"},
}


@pytest.fixture
def worker_api(client, worker):
    client.force_login(worker)
    return client


def _start(api, participant):
    return api.post(
        reverse("api:record-start"),
        {"participant": participant.pk},
        content_type="application/json",
    ).json()["id"]


def _add_seizure(api, record_id):
    return api.post(
        reverse("api:attachment-create", args=[record_id]),
        {"schema": "seizure_observation"},
        content_type="application/json",
    )


def _submit_seizure(api, attachment_id, answers=SEIZURE_ANSWERS):
    return api.post(
        reverse("api:attachment-submit", args=[attachment_id]),
        {"answers": answers},
        content_type="application/json",
    )


def _submit_record(api, record_id):
    return api.post(
        reverse("api:record-submit", args=[record_id]),
        {"answers": ANSWERS},
        content_type="application/json",
    )


def _submitted_record(participant, author, day, seizure=False):
    record = CareRecord.objects.create(
        participant=participant,
        home=participant.home,
        service_date=day,
        shift=Shift.NIGHT,
        answers={},
        status=RecordStatus.SUBMITTED,
        created_by=author,
        submitted_by=author,
    )
    if seizure:
        AttachedForm.objects.create(
            record=record,
            schema_key="seizure_observation",
            schema_version="v02",
            answers=clean_answers(SEIZURE, SEIZURE_ANSWERS),
            status=AttachmentStatus.SUBMITTED,
            created_by=author,
        )
    return record


# The schema -----------------------------------------------------------------


def test_ticked_boxes_keep_only_real_options_in_form_order():
    answers = clean_answers(SEIZURE, {"awareness": ["not_responsive", "bogus", "confused"]})
    assert answers["awareness"] == ["confused", "not_responsive"]


def test_injury_details_only_matter_when_someone_was_injured():
    uninjured = clean_answers(SEIZURE, SEIZURE_ANSWERS)
    assert uninjured["injury_details"] is None
    assert "injury_details" not in validate(SEIZURE, uninjured)

    injured = clean_answers(
        SEIZURE, dict(SEIZURE_ANSWERS, person_injured="true", injury_details="")
    )
    assert validate(SEIZURE, injured)["injury_details"] == "Describe the injury"


def test_a_signature_is_a_typed_name_or_a_drawn_png():
    field = find_field(SEIZURE, "signature")
    assert coerce(field, {"mode": "typed", "name": " K. Mitchell "})["name"] == "K. Mitchell"
    assert coerce(field, {"mode": "drawn", "data": "data:image/png;base64,iVBORw0KGgo="})
    assert coerce(field, {"mode": "drawn", "data": "javascript:alert(1)"}) is None
    assert coerce(field, {"mode": "typed", "name": "   "}) is None
    assert coerce(field, "K. Mitchell") is None


def test_the_falls_warning_is_shown_but_never_stored():
    answers = clean_answers(SEIZURE, dict(SEIZURE_ANSWERS, falls_notice="anything"))
    assert "falls_notice" not in answers


def test_a_chart_holding_only_the_prefilled_observer_counts_as_empty():
    assert not has_content(SEIZURE, {"observer_name": "Karen Mitchell"})
    assert has_content(SEIZURE, {"observer_name": "Karen Mitchell", "falls": False})


@pytest.mark.parametrize(
    ("typed", "printed"),
    [
        ("2 min 10 sec", "2m 10s"),
        ("1m 40s", "1m 40s"),
        ("45 seconds", "45s"),
        ("about two minutes", "about two minutes"),
        ("", ""),
    ],
)
def test_seizure_lengths_print_compactly(typed, printed):
    assert compact_duration(typed) == printed


# The write path -------------------------------------------------------------


def test_seizure_charts_attach_to_a_draft_record_in_order(worker_api, daniel):
    record_id = _start(worker_api, daniel)

    first = _add_seizure(worker_api, record_id)
    assert first.status_code == 201
    assert first.json()["label"] == "Seizure 1"
    assert first.json()["answers"] == {"observer_name": "Karen Mitchell"}

    assert _add_seizure(worker_api, record_id).json()["label"] == "Seizure 2"

    record = worker_api.get(reverse("api:record-detail", args=[record_id])).json()
    assert [a["label"] for a in record["attachments"]] == ["Seizure 1", "Seizure 2"]


def test_only_attachable_forms_can_be_added(worker_api, daniel):
    record_id = _start(worker_api, daniel)
    for schema in ("daily_care", "bowel_chart", ""):
        response = worker_api.post(
            reverse("api:attachment-create", args=[record_id]),
            {"schema": schema},
            content_type="application/json",
        )
        assert response.status_code == 400, schema


def test_another_homes_seizure_chart_is_out_of_reach(worker_api, other_worker, daniel):
    record_id = _start(worker_api, daniel)
    attachment_id = _add_seizure(worker_api, record_id).json()["id"]

    worker_api.force_login(other_worker)
    assert worker_api.get(reverse("api:attachment-detail", args=[attachment_id])).status_code == 404
    assert _add_seizure(worker_api, record_id).status_code == 404


def test_submitting_a_seizure_chart_validates_and_is_audited(worker_api, daniel):
    record_id = _start(worker_api, daniel)
    attachment_id = _add_seizure(worker_api, record_id).json()["id"]

    rejected = _submit_seizure(worker_api, attachment_id, {"observer_name": "Karen Mitchell"})
    assert rejected.status_code == 400
    assert {"start_time", "seizure_length", "signature"} <= set(rejected.json()["errors"])

    accepted = _submit_seizure(worker_api, attachment_id)
    assert accepted.status_code == 200
    body = accepted.json()
    assert body["status"] == "submitted"
    assert body["description"] == "14:20 · 2m 10s"
    assert body["answers"]["awareness"] == ["confused"]
    assert AuditEvent.objects.filter(
        action=AuditEvent.Action.SUBMIT, target__endswith="Seizure 1"
    ).exists()


def test_changing_a_submitted_chart_returns_it_to_draft(worker_api, daniel):
    record_id = _start(worker_api, daniel)
    attachment_id = _add_seizure(worker_api, record_id).json()["id"]
    _submit_seizure(worker_api, attachment_id)
    url = reverse("api:attachment-draft", args=[attachment_id])

    unchanged = worker_api.patch(url, {"answers": SEIZURE_ANSWERS}, content_type="application/json")
    assert unchanged.json()["status"] == "submitted"

    changed = worker_api.patch(
        url,
        {"answers": dict(SEIZURE_ANSWERS, recovery_length="15 minutes")},
        content_type="application/json",
    )
    assert changed.json()["status"] == "draft"


def test_a_record_waits_for_an_unfinished_seizure_chart(worker_api, daniel):
    record_id = _start(worker_api, daniel)
    attachment_id = _add_seizure(worker_api, record_id).json()["id"]
    worker_api.patch(
        reverse("api:attachment-draft", args=[attachment_id]),
        {"answers": {"start_time": "14:20"}},
        content_type="application/json",
    )

    blocked = _submit_record(worker_api, record_id)
    assert blocked.status_code == 400
    assert "Seizure 1 is not submitted yet" in blocked.json()["detail"]
    assert CareRecord.objects.get().status == RecordStatus.DRAFT


def test_a_blank_seizure_chart_is_discarded_on_submit(worker_api, daniel):
    record_id = _start(worker_api, daniel)
    _add_seizure(worker_api, record_id)

    assert _submit_record(worker_api, record_id).status_code == 200
    assert AttachedForm.objects.count() == 0


def test_the_record_pdf_carries_the_seizure_chart(worker_api, daniel):
    record_id = _start(worker_api, daniel)
    _submit_seizure(worker_api, _add_seizure(worker_api, record_id).json()["id"])

    body = _submit_record(worker_api, record_id).json()
    labels = [page["label"] for page in body["document_pages"]]
    assert labels[0] == "Daily Care Needs"
    assert labels[-1] == "Seizure Observation"
    assert [form["badge"] for form in body["forms"]] == ["DCN", "SEIZURE"]
    assert "1 seizure, 2m 10s" in body["summary"]


def test_a_submitted_record_locks_its_seizure_charts(worker_api, daniel):
    record_id = _start(worker_api, daniel)
    attachment_id = _add_seizure(worker_api, record_id).json()["id"]
    _submit_seizure(worker_api, attachment_id)
    _submit_record(worker_api, record_id)

    draft = worker_api.patch(
        reverse("api:attachment-draft", args=[attachment_id]),
        {"answers": SEIZURE_ANSWERS},
        content_type="application/json",
    )
    assert draft.status_code == 409
    assert (
        worker_api.delete(reverse("api:attachment-detail", args=[attachment_id])).status_code == 409
    )
    assert _add_seizure(worker_api, record_id).status_code == 409


def test_a_draft_seizure_chart_can_be_discarded(worker_api, daniel):
    record_id = _start(worker_api, daniel)
    attachment_id = _add_seizure(worker_api, record_id).json()["id"]

    assert (
        worker_api.delete(reverse("api:attachment-detail", args=[attachment_id])).status_code == 204
    )
    assert AttachedForm.objects.count() == 0


# Finding and exporting ------------------------------------------------------


def test_records_can_be_narrowed_to_those_with_a_seizure_chart(client, manager, daniel, worker):
    today = dt.date.today()
    with_seizure = _submitted_record(daniel, worker, today, seizure=True)
    _submitted_record(daniel, worker, today - dt.timedelta(days=1))
    client.force_login(manager)

    body = client.get(reverse("api:record-list"), {"form": "seizure_observation"}).json()
    assert [row["id"] for row in body["results"]] == [with_seizure.pk]
    assert [form["badge"] for form in body["results"][0]["forms"]] == ["DCN", "SEIZURE"]
    assert client.get(reverse("api:record-list"), {"form": "daily_care"}).json()["count"] == 2


def test_selected_rows_export_on_their_own(client, manager, daniel, worker):
    today = dt.date.today()
    chosen = _submitted_record(daniel, worker, today, seizure=True)
    _submitted_record(daniel, worker, today - dt.timedelta(days=1))
    client.force_login(manager)

    rows = client.get(reverse("api:export-csv"), {"id": [chosen.pk]}).content.decode().splitlines()
    assert len(rows) == 2
    assert rows[0].split(",")[-2:] == ["Forms", "Seizures"]
    assert rows[1].endswith(",1")


def test_the_records_list_honours_a_page_size(client, manager, daniel, worker):
    for offset in range(3):
        _submitted_record(daniel, worker, dt.date.today() - dt.timedelta(days=offset))
    client.force_login(manager)

    body = client.get(reverse("api:record-list"), {"page_size": 2}).json()
    assert body["count"] == 3
    assert len(body["results"]) == 2
