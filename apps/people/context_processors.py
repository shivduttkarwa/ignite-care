from django.conf import settings

from apps.notices.models import Notice, NoticeRead
from apps.records.models import RecordStatus
from apps.records.services import current_shift


def portal(request):
    user = getattr(request, "user", None)
    if user is None or not user.is_authenticated:
        return {"organisation_name": settings.ORGANISATION_NAME}

    profile = getattr(user, "staff_profile", None)
    home = getattr(request, "active_home", None)
    homes = getattr(request, "available_homes", None)

    from apps.people.models import Participant

    participants = Participant.objects.visible_to(user).active()
    scope = participants if profile and profile.is_manager else participants.filter(home=home)

    shift, service_date = current_shift()
    covered = scope.filter(
        records__service_date=service_date,
        records__shift=shift,
        records__status__in=[RecordStatus.SUBMITTED, RecordStatus.NOT_REQUIRED],
    ).count()

    notices = Notice.objects.published().for_home(None if profile and profile.is_manager else home)
    read = NoticeRead.objects.filter(user=user).values_list("notice_id", flat=True)

    return {
        "organisation_name": settings.ORGANISATION_NAME,
        "staff_profile": profile,
        "active_home": home,
        "available_homes": homes,
        "nav_participants": scope.count(),
        "nav_outstanding": max(scope.count() - covered, 0),
        "nav_unread": notices.exclude(pk__in=read).count(),
    }
