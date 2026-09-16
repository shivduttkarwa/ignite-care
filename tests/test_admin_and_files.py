"""Administration, the PDF preview, the participant history window and deployment settings."""

import datetime as dt

from django.contrib.auth import get_user_model
from django.urls import reverse

from apps.api.auth import client_ip
from apps.pdfgen.templatetags.care import clock
from apps.records.models import AuditEvent

from .test_pdf_and_exports import make_record


def test_the_admin_opens_for_a_superuser(client, db, daniel, worker):
    admin_user = get_user_model().objects.create_superuser(
        "admin", "admin@ignite.test", "portal-testing-2026"
    )
    record = make_record(daniel, worker, dt.date(2026, 8, 12))
    client.force_login(admin_user)

    for name in (
        "admin:people_participant_changelist",
        "admin:people_participant_add",
        "admin:people_home_changelist",
        "admin:people_conditiontag_changelist",
        "admin:auth_user_changelist",
        "admin:notices_notice_add",
        "admin:records_carerecord_changelist",
        "admin:records_auditevent_changelist",
    ):
        assert client.get(reverse(name)).status_code == 200, name

    assert client.get(reverse("admin:auth_user_change", args=[worker.pk])).status_code == 200
    assert (
        client.get(reverse("admin:records_carerecord_change", args=[record.pk])).status_code == 200
    )


def test_previewing_a_pdf_is_audited_as_a_view(client, db, daniel, worker):
    record = make_record(daniel, worker, dt.date(2026, 8, 12))
    client.force_login(worker)

    response = client.get(reverse("api:record-pdf", args=[record.pk]), {"inline": "1"})
    assert response.status_code == 200
    assert response["Content-Disposition"].startswith("inline")
    assert AuditEvent.objects.filter(
        action=AuditEvent.Action.VIEW, target=record.reference, detail__pdf="preview"
    ).exists()


def test_participant_history_can_reach_further_back(client, worker, daniel):
    client.force_login(worker)
    url = reverse("api:participant-records", args=[daniel.pk])

    assert client.get(url, {"days": 21}).json()["days"] == 21
    assert client.get(url, {"days": 5000}).json()["days"] == 365


def test_the_pdf_prints_times_the_way_the_paper_form_does():
    assert clock("23:00") == "11:00pm"
    assert clock("05:30") == "5:30am"
    assert clock(dt.time(0, 5)) == "12:05am"
    assert clock("not a time") == "not a time"


def test_login_lockout_uses_the_address_nginx_forwards(rf):
    behind_nginx = rf.get("/", HTTP_X_FORWARDED_FOR="203.0.113.7", REMOTE_ADDR="")
    assert client_ip(behind_nginx) == "203.0.113.7"
    assert client_ip(rf.get("/", REMOTE_ADDR="198.51.100.2")) == "198.51.100.2"
