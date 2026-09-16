"""Summary cards on the Django admin landing page."""

import datetime as dt

from django.contrib.auth import get_user_model
from django.utils import timezone


def cards(request, context):
    from apps.people.models import Home, Participant, StaffProfile
    from apps.records.models import CareRecord, RecordStatus

    since = timezone.localdate() - dt.timedelta(days=7)
    participants = Participant.objects.filter(is_active=True)
    homes = Home.objects.filter(is_active=True).count()
    staff = get_user_model().objects.filter(is_active=True, staff_profile__is_active=True)
    managers = staff.filter(staff_profile__role=StaffProfile.Role.MANAGER).count()
    records = CareRecord.objects.filter(service_date__gte=since)
    submitted = records.filter(status=RecordStatus.SUBMITTED).count()
    drafts = CareRecord.objects.filter(status=RecordStatus.DRAFT).count()

    context["ignite_cards"] = [
        {
            "label": "Participants",
            "value": participants.count(),
            "hint": f"across {homes} {'property' if homes == 1 else 'properties'}",
        },
        {
            "label": "Staff accounts",
            "value": staff.count(),
            "hint": f"{managers} {'manager' if managers == 1 else 'managers'}",
        },
        {
            "label": "Submitted this week",
            "value": submitted,
            "hint": f"of {records.count()} records since {since.day} {since:%b}"
            if records.count()
            else "no records yet",
        },
        {
            "label": "Still in draft",
            "value": drafts,
            "hint": "not yet submitted",
        },
    ]
    return context
