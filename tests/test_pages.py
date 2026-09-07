"""Every screen renders for the right role, at every breakpoint's markup."""

import pytest
from django.urls import reverse

WORKER_PAGES = ["dashboard", "participant_list", "notice_list"]
MANAGER_ONLY = ["record_list", "property_list", "worker_list"]


@pytest.mark.parametrize("name", WORKER_PAGES)
def test_worker_pages_render(client, worker, daniel, name):
    client.force_login(worker)
    response = client.get(reverse(name))
    assert response.status_code == 200


@pytest.mark.parametrize("name", MANAGER_ONLY + WORKER_PAGES)
def test_manager_pages_render(client, manager, daniel, grace, name):
    client.force_login(manager)
    response = client.get(reverse(name))
    assert response.status_code == 200


def test_manager_and_worker_get_different_dashboards(client, worker, manager, daniel):
    client.force_login(worker)
    assert "Today's shift" in client.get(reverse("dashboard")).content.decode()

    client.force_login(manager)
    assert "Service overview" in client.get(reverse("dashboard")).content.decode()


def test_records_screen_is_manager_only(client, worker):
    client.force_login(worker)
    assert client.get(reverse("record_list")).status_code == 302


def test_opening_notices_marks_them_read(client, worker, acacia):
    from apps.notices.models import Notice, NoticeRead

    Notice.objects.create(title="Policy update", body="Please read.", author=worker)
    client.force_login(worker)

    assert NoticeRead.objects.count() == 0
    client.get(reverse("notice_list"))
    assert NoticeRead.objects.filter(user=worker).count() == 1


def test_participant_search_filters_the_list(client, worker, daniel):
    client.force_login(worker)
    hit = client.get(reverse("participant_list"), {"q": "Daniel"}).content.decode()
    assert "Daniel Reeves" in hit

    miss = client.get(reverse("participant_list"), {"q": "Zebedee"}).content.decode()
    assert "No participants found" in miss


def test_file_links_are_never_boosted_by_htmx(client, manager, daniel, grace):
    """A boosted download link swaps binary into the page instead of saving it."""
    import re

    client.force_login(manager)
    for name in ("dashboard", "record_list", "participant_detail"):
        url = reverse(name, args=[daniel.pk] if name == "participant_detail" else [])
        html = client.get(url).content.decode()
        for anchor in re.findall(r"<a [^>]*>", html):
            if re.search(r"export\.|\.pdf|book\.pdf|/pdf/", anchor):
                assert 'hx-boost="false"' in anchor, anchor
