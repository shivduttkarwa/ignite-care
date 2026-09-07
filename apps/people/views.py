from datetime import timedelta

from django.contrib.auth import get_user_model
from django.contrib.auth.decorators import login_required
from django.db.models import Count, Q
from django.shortcuts import get_object_or_404, redirect, render
from django.utils import timezone

from apps.notices.models import Notice, NoticeRead
from apps.records.models import CareRecord, RecordStatus
from apps.records.schema import load_schema, summarise
from apps.records.services import (
    current_shift,
    previous_shift,
    records_for_shift,
    shift_label,
    shift_state,
)

from .middleware import SESSION_KEY
from .models import Participant

User = get_user_model()


def _shift_rows(home, service_date, shift):
    """One row per participant in a home, with whatever record exists for the shift."""
    if home is None:
        return []
    participants = (
        Participant.objects.active()
        .filter(home=home)
        .prefetch_related("tags")
        .order_by("first_name", "last_name")
    )
    existing = records_for_shift(home, service_date, shift)
    rows = []
    for participant in participants:
        record = existing.get(participant.pk)
        rows.append(
            {
                "participant": participant,
                "record": record,
                "state": shift_state(record),
                "is_done": record is not None
                and record.status in {RecordStatus.SUBMITTED, RecordStatus.NOT_REQUIRED},
            }
        )
    return rows


def _notices_for(user, home, limit=6):
    notices = list(
        Notice.objects.published().for_home(home).select_related("author__staff_profile")[:limit]
    )
    read_ids = set(
        NoticeRead.objects.filter(user=user, notice__in=notices).values_list("notice_id", flat=True)
    )
    return notices, {n.pk for n in notices} - read_ids


@login_required
def switch_home(request, home_id):
    if request.available_homes.filter(pk=home_id).exists():
        request.session[SESSION_KEY] = home_id
    return redirect(request.GET.get("next") or "dashboard")


@login_required
def dashboard(request):
    profile = getattr(request.user, "staff_profile", None)
    if profile is not None and profile.is_manager:
        return manager_dashboard(request)
    return worker_dashboard(request)


def worker_dashboard(request):
    home = request.active_home
    shift, service_date = current_shift()
    rows = _shift_rows(home, service_date, shift)

    total = len(rows)
    done = sum(1 for row in rows if row["is_done"])
    outstanding = total - done

    prev_shift, prev_date = previous_shift(shift, service_date)
    handover = []
    if home is not None:
        for record in (
            CareRecord.objects.filter(
                home=home, service_date=prev_date, shift=prev_shift, status=RecordStatus.SUBMITTED
            )
            .select_related("participant", "submitted_by")
            .order_by("participant__first_name")[:6]
        ):
            schema = load_schema(record.schema_key, record.schema_version)
            record.summary_parts = summarise(schema, record.answers, limit=3)
            handover.append(record)

    notices, unread_ids = _notices_for(request.user, home)

    return render(
        request,
        "dashboard_worker.html",
        {
            "today": service_date,
            "shift_label": shift_label(shift),
            "rows": rows,
            "done_count": done,
            "outstanding_count": outstanding,
            "total_count": total,
            "progress_pct": round(done / total * 100) if total else 0,
            "all_done": total > 0 and done == total,
            "notices": notices,
            "unread_ids": unread_ids,
            "unread_count": len(unread_ids),
            "handover": handover,
            "handover_label": shift_label(prev_shift),
            "handover_date": prev_date,
            "home_options": _home_options(request, home),
        },
    )


def manager_dashboard(request):
    shift, service_date = current_shift()
    homes = list(request.available_homes)

    by_property = []
    outstanding_rows = []
    total_done = total_expected = 0

    for home in homes:
        rows = _shift_rows(home, service_date, shift)
        done = sum(1 for row in rows if row["is_done"])
        total_done += done
        total_expected += len(rows)
        by_property.append(
            {
                "home": home,
                "done": done,
                "total": len(rows),
                "pct": round(done / len(rows) * 100) if rows else 0,
            }
        )
        outstanding_rows.extend(row | {"home": home} for row in rows if not row["is_done"])

    week_start = service_date - timedelta(days=6)
    week = CareRecord.objects.visible_to(request.user).filter(service_date__gte=week_start)

    recent = list(
        CareRecord.objects.visible_to(request.user)
        .exclude(status=RecordStatus.DRAFT)
        .select_related("participant", "home", "submitted_by__staff_profile")
        .order_by("-submitted_at")[:8]
    )

    notices, unread_ids = _notices_for(request.user, None, limit=4)

    workers_on_shift = (
        User.objects.filter(
            records_submitted__service_date=service_date, records_submitted__shift=shift
        )
        .distinct()
        .count()
    )

    return render(
        request,
        "dashboard_manager.html",
        {
            "today": service_date,
            "shift_label": shift_label(shift),
            "by_property": by_property,
            "outstanding_rows": outstanding_rows[:8],
            "outstanding_count": total_expected - total_done,
            "done_count": total_done,
            "expected_count": total_expected,
            "compliance_pct": round(total_done / total_expected * 100) if total_expected else 0,
            "week_count": week.filter(status=RecordStatus.SUBMITTED).count(),
            "participant_count": Participant.objects.visible_to(request.user).active().count(),
            "workers_on_shift": workers_on_shift,
            "recent": recent,
            "notices": notices,
            "unread_ids": unread_ids,
            "unread_count": len(unread_ids),
        },
    )


def _home_options(request, active):
    return [
        {
            "obj": option,
            "is_active": active is not None and option.pk == active.pk,
            "participant_count": option.participants.filter(is_active=True).count(),
        }
        for option in request.available_homes
    ]


@login_required
def participant_list(request):
    query = request.GET.get("q", "").strip()
    home_filter = request.GET.get("home") or ""

    people = (
        Participant.objects.visible_to(request.user)
        .active()
        .select_related("home")
        .prefetch_related("tags")
        .order_by("home__position", "first_name", "last_name")
    )
    if query:
        people = people.filter(
            Q(first_name__icontains=query)
            | Q(last_name__icontains=query)
            | Q(preferred_name__icontains=query)
            | Q(room__icontains=query)
        )
    if home_filter:
        people = people.filter(home_id=home_filter)

    shift, service_date = current_shift()
    people = list(people)
    records = {
        row.participant_id: row
        for row in CareRecord.objects.filter(
            participant__in=people, service_date=service_date, shift=shift
        )
    }

    grouped = {}
    for person in people:
        record = records.get(person.pk)
        grouped.setdefault(person.home, []).append(
            {
                "participant": person,
                "record": record,
                "state": shift_state(record),
                "is_done": record is not None
                and record.status in {RecordStatus.SUBMITTED, RecordStatus.NOT_REQUIRED},
            }
        )

    return render(
        request,
        "people/participant_list.html",
        {
            "groups": [{"home": home, "rows": rows} for home, rows in grouped.items()],
            "count": len(people),
            "query": query,
            "home_filter": home_filter,
            "homes": request.available_homes,
            "shift_label": shift_label(shift),
        },
    )


@login_required
def participant_detail(request, pk):
    participant = get_object_or_404(
        Participant.objects.visible_to(request.user).prefetch_related("tags"), pk=pk
    )

    try:
        days = int(request.GET.get("days", 7))
    except ValueError:
        days = 7
    days = days if days in {7, 14, 30} else 7
    since = timezone.localdate() - timedelta(days=days - 1)

    records = list(
        participant.records.filter(service_date__gte=since)
        .exclude(status=RecordStatus.DRAFT)
        .select_related("submitted_by__staff_profile", "created_by")
        .order_by("-service_date", "-submitted_at")
    )
    for record in records:
        schema = load_schema(record.schema_key, record.schema_version)
        record.summary_parts = summarise(schema, record.answers)
        record.form_title = schema["short_title"]

    by_day = {}
    for record in records:
        by_day.setdefault(record.service_date, []).append(record)

    timeline = []
    cursor = timezone.localdate()
    while cursor >= since:
        timeline.append({"date": cursor, "records": by_day.get(cursor, [])})
        cursor -= timedelta(days=1)

    submitted = participant.records.filter(status=RecordStatus.SUBMITTED)
    return render(
        request,
        "people/participant_detail.html",
        {
            "participant": participant,
            "timeline": timeline,
            "days": days,
            "day_options": [7, 14, 30],
            "record_total": submitted.count(),
            "first_record": submitted.order_by("service_date").values_list(
                "service_date", flat=True
            ).first(),
        },
    )


@login_required
def notice_list(request):
    home = request.active_home
    notices = list(
        Notice.objects.published().for_home(home).select_related("author__staff_profile")
    )
    read_ids = set(
        NoticeRead.objects.filter(user=request.user, notice__in=notices).values_list(
            "notice_id", flat=True
        )
    )
    for notice in notices:
        notice.is_unread = notice.pk not in read_ids

    NoticeRead.objects.bulk_create(
        [NoticeRead(notice=n, user=request.user) for n in notices if n.is_unread],
        ignore_conflicts=True,
    )

    return render(request, "notices/notice_list.html", {"notices": notices})


@login_required
def property_list(request):
    shift, service_date = current_shift()
    homes = (
        request.available_homes.annotate(
            participant_count=Count("participants", filter=Q(participants__is_active=True), distinct=True),
            staff_count=Count("staff", distinct=True),
        )
        .order_by("position", "name")
    )
    rows = []
    for home in homes:
        shift_rows = _shift_rows(home, service_date, shift)
        done = sum(1 for row in shift_rows if row["is_done"])
        rows.append(
            {
                "home": home,
                "done": done,
                "total": len(shift_rows),
                "pct": round(done / len(shift_rows) * 100) if shift_rows else 0,
            }
        )
    return render(
        request,
        "people/property_list.html",
        {"rows": rows, "shift_label": shift_label(shift)},
    )


@login_required
def worker_list(request):
    shift, service_date = current_shift()
    homes = request.available_homes
    staff = (
        User.objects.filter(staff_profile__isnull=False, staff_profile__homes__in=homes)
        .select_related("staff_profile")
        .prefetch_related("staff_profile__homes")
        .annotate(
            record_count=Count("records_submitted", distinct=True),
            week_count=Count(
                "records_submitted",
                filter=Q(records_submitted__service_date__gte=service_date - timedelta(days=6)),
                distinct=True,
            ),
        )
        .distinct()
        .order_by("first_name", "last_name")
    )
    return render(request, "people/worker_list.html", {"staff": staff})
