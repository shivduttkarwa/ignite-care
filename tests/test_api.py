"""The JSON API is the whole back end. Every rule the portal has is enforced here."""

import pytest
from django.urls import reverse

from apps.records.models import CareRecord, RecordStatus

PASSWORD = "portal-testing-2026"

ANSWERS = {
    "shower": "true",
    "bed_bath": "false",
    "physio": "true",
    "breakfast": "Weet-Bix and banana, ate well",
    "lunch": "Ham and salad sandwich",
    "dinner": "Spaghetti bolognese",
    "snacks": "",
    "fluids": "Approx 400ml water overnight",
    "other_food": "",
    "bowel": "One bowel motion 7:15pm, soft, normal",
    "urine": "Passing urine normally",
    "sleep_from": "23:00",
    "sleep_to": "05:30",
    "awake_notes": "Settled back easily",
}


@pytest.fixture
def worker_api(client, worker):
    client.force_login(worker)
    return client


# Auth -----------------------------------------------------------------------


def test_api_rejects_anonymous_callers(client, db):
    for name in ("api:me", "api:dashboard", "api:participant-list", "api:schema-list"):
        assert client.get(reverse(name)).status_code in (401, 403), name


def test_login_endpoint_starts_a_session(client, worker):
    bad = client.post(
        reverse("api:login"),
        {"username": worker.username, "password": "wrong"},
        content_type="application/json",
    )
    assert bad.status_code == 401

    good = client.post(
        reverse("api:login"),
        {"username": worker.username, "password": PASSWORD},
        content_type="application/json",
    )
    assert good.status_code == 200
    assert good.json()["is_manager"] is False
    assert client.get(reverse("api:me")).status_code == 200


def test_me_describes_the_caller(worker_api, acacia):
    body = worker_api.get(reverse("api:me")).json()
    assert body["is_manager"] is False
    assert body["role"] == "worker"
    assert [h["label"] for h in body["homes"]] == ["Acacia House"]
    assert body["shift"]["key"] in {"morning", "afternoon", "night"}


# Schemas --------------------------------------------------------------------


def test_schema_endpoint_serves_the_form_definition(worker_api):
    listing = worker_api.get(reverse("api:schema-list")).json()
    assert any(s["key"] == "daily_care" for s in listing)

    schema = worker_api.get(reverse("api:schema-detail", args=["daily_care", "v02"])).json()
    assert schema["title"] == "Daily Care Needs Record"
    keys = [f["key"] for s in schema["sections"] for f in s["fields"]]
    assert "fluids" in keys and "attendances" in keys, "a client renders the form from this"


# Scoping --------------------------------------------------------------------


def test_a_worker_only_sees_their_own_home(client, other_worker, daniel, grace):
    client.force_login(other_worker)
    names = [p["full_name"] for p in client.get(reverse("api:participant-list")).json()]
    assert "Grace Tuilagi" in names
    assert "Daniel Reeves" not in names

    assert client.get(reverse("api:participant-detail", args=[daniel.pk])).status_code == 404


def test_records_screen_is_manager_only(worker_api, manager, client, daniel):
    assert worker_api.get(reverse("api:record-list")).status_code == 403

    client.force_login(manager)
    assert client.get(reverse("api:record-list")).status_code == 200


# The write path -------------------------------------------------------------


def test_start_then_submit_locks_and_makes_a_pdf(worker_api, daniel):
    started = worker_api.post(
        reverse("api:record-start"), {"participant": daniel.pk}, content_type="application/json"
    )
    assert started.status_code == 201
    record_id = started.json()["id"]

    again = worker_api.post(
        reverse("api:record-start"), {"participant": daniel.pk}, content_type="application/json"
    )
    assert again.status_code == 200, "the same shift reuses one draft"
    assert CareRecord.objects.count() == 1

    submitted = worker_api.post(
        reverse("api:record-submit", args=[record_id]),
        {
            "answers": ANSWERS,
            "attendances": [{"time": "23:40", "purpose": "Toilet assist", "duration_minutes": 10}],
        },
        content_type="application/json",
    )
    assert submitted.status_code == 200
    body = submitted.json()
    assert body["status"] == "submitted"
    assert body["is_locked"] is True
    assert body["has_pdf"] is True
    assert body["shower"] is True and body["physio_completed"] is True

    record = CareRecord.objects.get()
    assert record.attendances.count() == 1
    assert record.document.page_count >= 1


def test_submitting_without_fluids_is_rejected(worker_api, daniel):
    record_id = worker_api.post(
        reverse("api:record-start"), {"participant": daniel.pk}, content_type="application/json"
    ).json()["id"]

    response = worker_api.post(
        reverse("api:record-submit", args=[record_id]),
        {"answers": dict(ANSWERS, fluids="")},
        content_type="application/json",
    )
    assert response.status_code == 400
    assert response.json()["errors"]["fluids"] == "Fluids must be recorded every shift"
    assert CareRecord.objects.get().status == RecordStatus.DRAFT


def test_a_locked_record_cannot_be_written_to(worker_api, daniel):
    record_id = worker_api.post(
        reverse("api:record-start"), {"participant": daniel.pk}, content_type="application/json"
    ).json()["id"]
    worker_api.post(
        reverse("api:record-submit", args=[record_id]),
        {"answers": ANSWERS},
        content_type="application/json",
    )

    for name in ("api:record-draft", "api:record-submit"):
        method = worker_api.patch if name.endswith("draft") else worker_api.post
        response = method(
            reverse(name, args=[record_id]),
            {"answers": ANSWERS},
            content_type="application/json",
        )
        assert response.status_code == 409, name


def test_hidden_answers_are_not_stored(worker_api, daniel):
    record_id = worker_api.post(
        reverse("api:record-start"), {"participant": daniel.pk}, content_type="application/json"
    ).json()["id"]

    worker_api.patch(
        reverse("api:record-draft", args=[record_id]),
        {"answers": dict(ANSWERS, no_wash_reason="Typed by mistake")},
        content_type="application/json",
    )
    assert CareRecord.objects.get().answers["no_wash_reason"] is None


def test_not_required_needs_a_reason(worker_api, daniel):
    blank = worker_api.post(
        reverse("api:record-not-required"),
        {"participant": daniel.pk, "reason": ""},
        content_type="application/json",
    )
    assert blank.status_code == 400
    assert CareRecord.objects.count() == 0

    ok = worker_api.post(
        reverse("api:record-not-required"),
        {"participant": daniel.pk, "reason": "In hospital overnight"},
        content_type="application/json",
    )
    assert ok.status_code == 200
    assert CareRecord.objects.get().status == RecordStatus.NOT_REQUIRED


# Dashboards and files -------------------------------------------------------


def test_dashboard_is_shaped_by_role(worker_api, client, manager, daniel):
    worker_body = worker_api.get(reverse("api:dashboard")).json()
    assert worker_body["is_manager"] is False
    assert "rows" in worker_body and "handover" in worker_body

    client.force_login(manager)
    manager_body = client.get(reverse("api:dashboard")).json()
    assert manager_body["is_manager"] is True
    assert "by_property" in manager_body and "compliance_pct" in manager_body


def test_pdf_endpoints_return_attachments(worker_api, daniel):
    record_id = worker_api.post(
        reverse("api:record-start"), {"participant": daniel.pk}, content_type="application/json"
    ).json()["id"]
    worker_api.post(
        reverse("api:record-submit", args=[record_id]),
        {"answers": ANSWERS},
        content_type="application/json",
    )

    pdf = worker_api.get(reverse("api:record-pdf", args=[record_id]))
    assert pdf.status_code == 200
    assert pdf["Content-Type"] == "application/pdf"
    assert pdf["Content-Disposition"].startswith("attachment;")

    book = worker_api.get(reverse("api:participant-book", args=[daniel.pk]))
    assert book.status_code == 200
    assert book["Content-Disposition"].startswith("attachment;")


def test_notices_report_and_clear_unread(worker_api, worker, acacia):
    from apps.notices.models import Notice

    Notice.objects.create(title="Policy update", body="Please read.", author=worker)

    first = worker_api.get(reverse("api:notice-list")).json()
    assert first["unread_count"] == 1
    assert first["results"][0]["is_unread"] is True

    worker_api.post(reverse("api:notice-read"), {}, content_type="application/json")
    assert worker_api.get(reverse("api:notice-list")).json()["unread_count"] == 0


def test_marking_not_required_clears_it_from_outstanding(worker_api, daniel):
    """Gap 2 - a participant in hospital must not sit on the board all night."""
    before = worker_api.get(reverse("api:dashboard")).json()
    assert before["outstanding_count"] >= 1

    worker_api.post(
        reverse("api:record-not-required"),
        {"participant": daniel.pk, "reason": "In hospital overnight"},
        content_type="application/json",
    )

    after = worker_api.get(reverse("api:dashboard")).json()
    assert after["outstanding_count"] == before["outstanding_count"] - 1
    row = next(r for r in after["rows"] if r["participant"]["id"] == daniel.pk)
    assert row["state"] == RecordStatus.NOT_REQUIRED
    assert row["is_done"] is True


def test_participant_list_carries_this_shift_state(worker_api, daniel):
    """The list has to say who is already done, or a worker records twice."""
    before = worker_api.get(reverse("api:participant-list")).json()[0]
    assert before["shift_state"] == "none"
    assert before["shift_record_id"] is None
    assert before["shift_is_done"] is False

    record_id = worker_api.post(
        reverse("api:record-start"), {"participant": daniel.pk}, content_type="application/json"
    ).json()["id"]

    drafted = worker_api.get(reverse("api:participant-list")).json()[0]
    assert drafted["shift_state"] == RecordStatus.DRAFT
    assert drafted["shift_record_id"] == record_id
    assert drafted["shift_is_done"] is False

    worker_api.post(
        reverse("api:record-submit", args=[record_id]),
        {"answers": ANSWERS},
        content_type="application/json",
    )

    done = worker_api.get(reverse("api:participant-list")).json()[0]
    assert done["shift_state"] == RecordStatus.SUBMITTED
    assert done["shift_is_done"] is True
