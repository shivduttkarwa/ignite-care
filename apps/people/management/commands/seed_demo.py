"""Builds a demonstration service so the portal can be shown end to end.

Phase 1 of the quote covers four support workers and one participant. This
seeds a little more than that so the dashboard, filters and record book have
something honest to show.
"""

import random
from datetime import datetime, time, timedelta

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from apps.notices.models import Notice
from apps.people.models import ConditionTag, Home, Participant, StaffProfile
from apps.records.models import CareRecord, OvernightAttendance, RecordStatus, Shift

User = get_user_model()

HOMES = [
    ("Acacia House", "Acacia House"),
    ("Banksia House", "Banksia House"),
    ("Coral Court", "Coral Court"),
]

TAGS = [
    ("Night walking", "neutral"),
    ("Diabetes", "neutral"),
    ("Non-verbal cues", "neutral"),
    ("Seizure risk", "caution"),
    ("Falls risk", "caution"),
]

WORKERS = [
    ("karen", "Karen", "Mitchell", "worker"),
    ("priya", "Priya", "Nair", "worker"),
    ("tom", "Tom", "Edwards", "worker"),
    ("aisha", "Aisha", "Bello", "worker"),
    ("sonia", "Sonia", "Delacroix", "manager"),
]

PARTICIPANTS = [
    {
        "first_name": "Daniel",
        "last_name": "Reeves",
        "preferred_name": "Danny",
        "room": "Room 2",
        "age": 34,
        "tags": ["Night walking", "Seizure risk", "Non-verbal cues"],
        "shift_alert": "Do not leave unattended near stairs",
        "allergies": "Penicillin (anaphylaxis). No known food allergies.",
        "mobility": "Steady by day. Do not leave unattended near stairs. Sensor mat active overnight.",
        "communication": "Understands short plain sentences. Points and uses picture cards when tired.",
        "emergency_contacts": "Mother, Anne Reeves 0412 555 210. On-call manager 1800 446 483.",
    },
    {
        "first_name": "Grace",
        "last_name": "Tuilagi",
        "room": "Room 1",
        "age": 41,
        "tags": ["Diabetes"],
        "allergies": "None known.",
        "mobility": "Independent. Uses a walking stick outdoors.",
        "communication": "Verbal. Prefers a quiet room in the evening.",
        "emergency_contacts": "Brother, Sione Tuilagi 0431 555 902.",
    },
    {
        "first_name": "Marcus",
        "last_name": "Wren",
        "room": "Room 4",
        "age": 28,
        "tags": ["Falls risk", "Night walking"],
        "shift_alert": "Uses walker after 8pm, keep hallway clear",
        "mobility": "Uses a walker after 8pm. Keep the hallway clear.",
        "communication": "Verbal, short sentences.",
        "emergency_contacts": "On-call manager 1800 446 483.",
    },
    {
        "first_name": "Lily",
        "last_name": "Pham",
        "room": "Room 3",
        "age": 37,
        "tags": [],
        "communication": "Verbal and confident.",
        "emergency_contacts": "Sister, Mai Pham 0498 555 331.",
    },
    {
        "first_name": "Sam",
        "last_name": "Keneally",
        "room": "Room 5",
        "age": 45,
        "tags": ["Seizure risk", "Diabetes"],
        "allergies": "Shellfish.",
        "mobility": "Independent indoors.",
        "emergency_contacts": "On-call manager 1800 446 483.",
    },
]

BREAKFASTS = ["Weet-Bix and banana, ate well", "Toast and eggs, ate half", "Porridge, ate well"]
LUNCHES = [
    "Ham and salad sandwich, half eaten",
    "Soup and a roll, ate well",
    "Chicken wrap, ate well",
]
DINNERS = [
    "Spaghetti bolognese, ate well",
    "Roast chicken and vegetables",
    "Fish and salad, ate half",
]
FLUIDS = ["Approx 400ml water overnight", "1.2L across the shift", "Approx 800ml, water and tea"]
BOWELS = [
    "One bowel motion 7:15pm, soft, normal",
    "No bowel motion this shift",
    "Two motions, formed",
]
URINES = ["Passing urine normally, no concerns", "Passing urine, slightly dark", "Normal output"]
AWAKE = [
    "Awake 2:00 to 2:20am, sat in lounge, no TV, settled back easily",
    "Slept through, no concerns",
    "Awake briefly at 4am, resettled quickly",
]


def _submitted_at(service_date, shift):
    """Workers write up at the end of their shift, not at seed time."""
    ends = {
        Shift.MORNING: (service_date, time(13, 40)),
        Shift.AFTERNOON: (service_date, time(21, 45)),
        Shift.NIGHT: (service_date + timedelta(days=1), time(5, 55)),
    }
    day, clock = ends[shift]
    jitter = timedelta(minutes=random.randint(-25, 20))
    naive = datetime.combine(day, clock) + jitter
    return timezone.make_aware(naive)


class Command(BaseCommand):
    help = "Create demonstration homes, workers, participants, notices and records."

    def add_arguments(self, parser):
        parser.add_argument("--days", type=int, default=10, help="Days of history to build.")

    @transaction.atomic
    def handle(self, *args, **options):
        random.seed(22)
        days = options["days"]

        homes = {}
        for position, (name, short) in enumerate(HOMES):
            home, _ = Home.objects.get_or_create(
                name=name, defaults={"short_name": short, "position": position}
            )
            homes[name] = home

        tags = {}
        for position, (label, tone) in enumerate(TAGS):
            tag, _ = ConditionTag.objects.get_or_create(
                label=label, defaults={"tone": tone, "position": position}
            )
            tags[label] = tag

        workers = {}
        for username, first, last, role in WORKERS:
            user, created = User.objects.get_or_create(
                username=username,
                defaults={
                    "first_name": first,
                    "last_name": last,
                    "email": f"{username}@ignite.test",
                },
            )
            if created:
                user.set_password("ignite-demo-2026")
                user.save()
            profile, _ = StaffProfile.objects.get_or_create(user=user, defaults={"role": role})
            profile.role = role
            profile.save()
            if role == "manager":
                profile.homes.set(homes.values())
            else:
                profile.homes.set([homes["Acacia House"], homes["Banksia House"]])
            workers[username] = user

        acacia = homes["Acacia House"]
        people = []
        for spec in PARTICIPANTS:
            born = timezone.localdate() - timedelta(days=spec["age"] * 365 + 40)
            person, _ = Participant.objects.get_or_create(
                first_name=spec["first_name"],
                last_name=spec["last_name"],
                defaults={
                    "home": acacia,
                    "preferred_name": spec.get("preferred_name", ""),
                    "room": spec.get("room", ""),
                    "date_of_birth": born,
                    "shift_alert": spec.get("shift_alert", ""),
                    "allergies": spec.get("allergies", ""),
                    "mobility": spec.get("mobility", ""),
                    "communication": spec.get("communication", ""),
                    "emergency_contacts": spec.get("emergency_contacts", ""),
                },
            )
            person.tags.set([tags[label] for label in spec["tags"]])
            people.append(person)

        Notice.objects.get_or_create(
            title="Grocery delivery moved to Saturday",
            defaults={
                "body": (
                    "Woolworths delivery for Acacia House now arrives Saturday 9 to 11am. "
                    "Please put cold items away first and check the substitutions list before signing."
                ),
                "author": workers["sonia"],
                "is_pinned": True,
            },
        )
        Notice.objects.get_or_create(
            title="Daniel's new sensor mat is installed",
            defaults={
                "body": (
                    "The sensor mat by Daniel's bed is active from tonight. It chimes at the staff "
                    "station when he gets up. Reset switch is on the wall behind the door."
                ),
                "author": workers["priya"],
            },
        )

        self._build_history(people, workers, days)
        self._build_today(people, workers)

        self.stdout.write(self.style.SUCCESS("Demonstration data ready."))
        self.stdout.write("  Workers: karen, priya, tom, aisha   Manager: sonia")
        self.stdout.write("  Password for all accounts: ignite-demo-2026")

    def _build_history(self, people, workers, days):
        from apps.pdfgen.render import build_record_document

        today = timezone.localdate()
        roster = [workers["karen"], workers["priya"], workers["tom"], workers["aisha"]]
        created = 0

        for offset in range(days, 0, -1):
            service_date = today - timedelta(days=offset)
            for person in people:
                for shift in (Shift.MORNING, Shift.AFTERNOON, Shift.NIGHT):
                    if random.random() < 0.45:
                        continue
                    worker = random.choice(roster)
                    submitted = _submitted_at(service_date, shift)
                    answers = {
                        "shower": random.random() < 0.7,
                        "bed_bath": random.random() < 0.2,
                        "no_wash_reason": "",
                        "physio": random.random() < 0.6,
                        "breakfast": random.choice(BREAKFASTS),
                        "lunch": random.choice(LUNCHES),
                        "dinner": random.choice(DINNERS),
                        "snacks": "",
                        "fluids": random.choice(FLUIDS),
                        "other_food": "",
                        "bowel": random.choice(BOWELS),
                        "urine": random.choice(URINES),
                        "sleep_from": "23:00",
                        "sleep_to": "05:30",
                        "awake_notes": random.choice(AWAKE) if shift == Shift.NIGHT else "",
                    }
                    if not answers["shower"] and not answers["bed_bath"]:
                        answers["no_wash_reason"] = "Declined, offered again in the morning."

                    record, made = CareRecord.objects.get_or_create(
                        participant=person,
                        service_date=service_date,
                        shift=shift,
                        schema_key="daily_care",
                        defaults={
                            "home": person.home,
                            "schema_version": "v02",
                            "answers": answers,
                            "created_by": worker,
                            "submitted_by": worker,
                            "submitted_at": submitted,
                            "status": RecordStatus.SUBMITTED,
                            "shower": answers["shower"],
                            "bed_bath": answers["bed_bath"],
                            "physio_completed": answers["physio"],
                            "bowel_recorded": bool(answers["bowel"]),
                            "urine_recorded": bool(answers["urine"]),
                            "fluids_recorded": bool(answers["fluids"]),
                        },
                    )
                    if not made:
                        continue

                    if shift == Shift.NIGHT:
                        OvernightAttendance.objects.bulk_create(
                            [
                                OvernightAttendance(
                                    record=record,
                                    time="23:40",
                                    purpose="Toilet assist",
                                    duration_minutes=10,
                                ),
                                OvernightAttendance(
                                    record=record,
                                    time="02:00",
                                    purpose="Found in lounge, resettled",
                                    duration_minutes=20,
                                ),
                            ]
                        )

                    try:
                        build_record_document(record)
                    except Exception as exc:  # noqa: BLE001
                        self.stderr.write(f"  PDF skipped for {record.reference}: {exc}")
                    created += 1

        self.stdout.write(f"  Built {created} submitted records with PDFs.")

    def _build_today(self, people, workers):
        """Leave the current shift part-done so the dashboards show real state."""
        from apps.pdfgen.render import build_record_document
        from apps.records.services import current_shift

        shift, service_date = current_shift()
        roster = [workers["karen"], workers["priya"], workers["tom"]]
        made = 0

        for index, person in enumerate(people):
            # Two in, one not required, the rest still outstanding.
            if index >= 3:
                continue
            worker = roster[index % len(roster)]
            if index == 2:
                CareRecord.objects.get_or_create(
                    participant=person,
                    service_date=service_date,
                    shift=shift,
                    schema_key="daily_care",
                    defaults={
                        "home": person.home,
                        "created_by": worker,
                        "status": RecordStatus.NOT_REQUIRED,
                        "not_required_reason": "At a medical appointment with family until tomorrow.",
                    },
                )
                made += 1
                continue

            answers = {
                "shower": True,
                "bed_bath": False,
                "no_wash_reason": "",
                "physio": index == 0,
                "breakfast": random.choice(BREAKFASTS),
                "lunch": random.choice(LUNCHES),
                "dinner": random.choice(DINNERS),
                "snacks": "",
                "fluids": random.choice(FLUIDS),
                "other_food": "",
                "bowel": random.choice(BOWELS),
                "urine": random.choice(URINES),
                "sleep_from": "22:45",
                "sleep_to": "06:10",
                "awake_notes": random.choice(AWAKE),
            }
            record, created = CareRecord.objects.get_or_create(
                participant=person,
                service_date=service_date,
                shift=shift,
                schema_key="daily_care",
                defaults={
                    "home": person.home,
                    "answers": answers,
                    "created_by": worker,
                    "submitted_by": worker,
                    "submitted_at": timezone.now() - timedelta(minutes=40 + index * 25),
                    "status": RecordStatus.SUBMITTED,
                    "shower": True,
                    "bed_bath": False,
                    "physio_completed": answers["physio"],
                    "bowel_recorded": True,
                    "urine_recorded": True,
                    "fluids_recorded": True,
                },
            )
            if created:
                try:
                    build_record_document(record)
                except Exception as exc:  # noqa: BLE001
                    self.stderr.write(f"  PDF skipped for {record.reference}: {exc}")
                made += 1

        self.stdout.write(f"  Seeded {made} records for the shift running now.")
