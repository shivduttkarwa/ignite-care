import pytest
from django.urls import reverse

from apps.records.models import CareRecord, RecordStatus

PASSWORD = "portal-testing-2026"

FULL_ANSWERS = {
    "shower": "true",
    "bed_bath": "false",
    "physio": "true",
    "breakfast": "Weet-Bix and banana, ate well",
    "lunch": "Ham and salad sandwich, half eaten",
    "dinner": "Spaghetti bolognese, ate well",
    "snacks": "",
    "fluids": "Approx 400ml water overnight",
    "other_food": "",
    "bowel": "One bowel motion 7:15pm, soft, normal",
    "urine": "Passing urine normally",
    "sleep_from": "23:00",
    "sleep_to": "05:30",
    "awake_notes": "Awake 2:00 to 2:20am, settled back easily",
}


@pytest.fixture
def signed_in(client, worker):
    client.force_login(worker)
    return client


def test_new_record_creates_a_draft_for_this_shift(signed_in, daniel):
    response = signed_in.get(reverse("record_new", args=[daniel.pk]))
    record = CareRecord.objects.get()
    assert record.status == RecordStatus.DRAFT
    assert record.home == daniel.home
    assert record.reference.startswith("IG-")
    assert response.url == reverse("record_edit", args=[record.pk])


def test_new_record_twice_reuses_the_same_draft(signed_in, daniel):
    signed_in.get(reverse("record_new", args=[daniel.pk]))
    signed_in.get(reverse("record_new", args=[daniel.pk]))
    assert CareRecord.objects.count() == 1


def test_submitting_without_fluids_is_rejected(signed_in, daniel):
    signed_in.get(reverse("record_new", args=[daniel.pk]))
    record = CareRecord.objects.get()

    payload = dict(FULL_ANSWERS, fluids="", intent="submit")
    response = signed_in.post(reverse("record_edit", args=[record.pk]), payload)

    record.refresh_from_db()
    assert response.status_code == 200
    assert record.status == RecordStatus.DRAFT
    assert "Fluids must be recorded every shift" in response.content.decode()


def test_submitting_locks_the_record_and_stores_a_pdf(signed_in, daniel):
    signed_in.get(reverse("record_new", args=[daniel.pk]))
    record = CareRecord.objects.get()

    signed_in.post(
        reverse("record_edit", args=[record.pk]),
        dict(
            FULL_ANSWERS,
            intent="submit",
            attendance_time=["23:40"],
            attendance_purpose=["Toilet assist"],
            attendance_duration=["10"],
        ),
    )

    record.refresh_from_db()
    assert record.status == RecordStatus.SUBMITTED
    assert record.submitted_at is not None
    assert record.is_locked

    assert record.shower is True
    assert record.bed_bath is False
    assert record.physio_completed is True
    assert record.bowel_recorded is True

    assert record.attendances.count() == 1
    assert record.document.page_count >= 1
    assert record.document.sha256


def test_a_locked_record_cannot_be_edited(signed_in, daniel):
    signed_in.get(reverse("record_new", args=[daniel.pk]))
    record = CareRecord.objects.get()
    signed_in.post(reverse("record_edit", args=[record.pk]), dict(FULL_ANSWERS, intent="submit"))

    response = signed_in.get(reverse("record_edit", args=[record.pk]))
    assert response.url == reverse("record_detail", args=[record.pk])


def test_hidden_answers_are_not_stored(signed_in, daniel):
    """A reason typed before ticking Shower: Yes must not survive."""
    signed_in.get(reverse("record_new", args=[daniel.pk]))
    record = CareRecord.objects.get()

    signed_in.post(
        reverse("record_edit", args=[record.pk]),
        dict(FULL_ANSWERS, no_wash_reason="Typed by mistake", intent="draft"),
    )

    record.refresh_from_db()
    assert record.answers["no_wash_reason"] is None


def test_not_required_needs_a_reason(signed_in, daniel):
    signed_in.post(reverse("record_not_required", args=[daniel.pk]), {"reason": ""})
    assert CareRecord.objects.count() == 0

    signed_in.post(
        reverse("record_not_required", args=[daniel.pk]), {"reason": "In hospital overnight"}
    )
    record = CareRecord.objects.get()
    assert record.status == RecordStatus.NOT_REQUIRED
    assert record.not_required_reason == "In hospital overnight"


def test_a_worker_cannot_reach_a_participant_in_another_home(client, other_worker, daniel):
    client.force_login(other_worker)
    assert client.get(reverse("participant_detail", args=[daniel.pk])).status_code == 404
    assert client.get(reverse("record_new", args=[daniel.pk])).status_code == 404
