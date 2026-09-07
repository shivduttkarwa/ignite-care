# Ignite Support Worker Portal

Replaces the handwritten daily care record books used across Ignite Community
Services' residential homes. Support workers lodge a record each shift, every
record renders to a PDF at submission, and a participant's whole book can be
compiled from those PDFs on demand.

## Stack

Python 3.12, Django 5.2 LTS, PostgreSQL in production and SQLite in
development. Django templates with HTMX and Alpine.js vendored locally, and no
build pipeline. WeasyPrint renders the PDFs and pypdf compiles the books.
django-simple-history keeps record history, django-otp provides TOTP two-factor
and django-axes handles lockout.

Total front-end payload is about 180KB including self-hosted Barlow.

## The four decisions the design rests on

**Forms are data, not code.** Each form is a versioned JSON schema in
`forms/schemas/`. One renderer draws the web form, one template draws the PDF.
Adding the Bowel Chart is a new schema plus a print template, not a new model,
migration, view and set of templates.

**Answers are hybrid.** They live in a `JSONField`, but the fields the client
filters and reports on — physio, shower, bowel, urine, fluids — are promoted to
real indexed columns on `CareRecord` and kept in step on save. Schema
flexibility with fast, sane reporting.

**Records lock on submit.** A submitted record is immutable. Corrections are
appended as a `RecordAmendment` carrying author, timestamp and reason, and are
printed in the PDF. `AuditEvent` logs reads and exports as well as writes,
because for health data who *downloaded* something matters.

**PDFs are artefacts, not renders.** The PDF is generated once at submission and
stored. The record book is a concatenation of those stored files, never a
re-render of history — if a template changes in 2027, a record signed in 2026
must still print exactly as it was signed.

## Shifts, not days

A night shift starting 10pm Tuesday and finishing 6am Wednesday belongs to
**Tuesday**, the way it does in the paper book. `service_date` is the date the
shift started and is separate from `submitted_at`; both print on the PDF. A
participant can have up to three records a day, one per shift.

## Local setup

Requires Python 3.12 and [uv](https://docs.astral.sh/uv/).

```bash
uv venv --python 3.12 .venv
uv sync
cp .env.example .env
.venv/Scripts/python manage.py migrate
.venv/Scripts/python manage.py seed_demo --days 12
.venv/Scripts/python manage.py runserver
```

### Testing on a phone

Run the server on every interface and open the machine's LAN address from a
device on the same wi-fi:

```bash
.venv/Scripts/python manage.py runserver 0.0.0.0:8811
```

`config/settings/local.py` sets `ALLOWED_HOSTS = ["*"]` for this. It is a
development-only file; `production.py` still requires an explicit host list.

Note that `http://` on a LAN IP is not a secure context, so the browser will not
offer to install the PWA. To test the installed app, forward the port over USB
with Chrome DevTools so the phone sees it as `localhost`, or put an HTTPS tunnel
in front of it.

### WeasyPrint on Windows

WeasyPrint needs the GTK3 runtime. Install
[gtk3-runtime](https://github.com/tschoonj/GTK-for-Windows-Runtime-Environment-Installer/releases)
and point `WEASYPRINT_DLL_DIR` in `.env` at its `bin` directory.
`apps/pdfgen/render.py` adds it to the DLL search path at run time. On Linux the
setting is ignored and the distribution packages are used.

## Demonstration accounts

Password for every account is `ignite-demo-2026`.

| Username | Role |
| --- | --- |
| `karen`, `priya`, `tom`, `aisha` | Support workers, Acacia and Banksia House |
| `sonia` | Manager, all three homes |

## Tests

```bash
.venv/Scripts/python -m pytest
```

44 tests cover the things that must not break: shift date attribution across
midnight, conditional visibility and validation in the schema engine, submission
locking a record and storing its PDF, hidden answers never being persisted,
promoted columns tracking the answers, a worker in one home being unable to
reach a participant in another, book compilation, the exports, role-correct
dashboards, and every screen rendering for the roles allowed to see it.

## Layout

```
config/settings/     base.py -> local.py and production.py
apps/people/         Home, Participant, ConditionTag, StaffProfile, both dashboards
apps/records/        CareRecord, schema engine, shift services, record views
apps/notices/        Notice and read tracking
apps/pdfgen/         WeasyPrint rendering and book compilation
apps/exports/        manager records screen, drawer, CSV and XLSX
forms/schemas/       versioned form definitions
templates/layouts/   app.html, the one frame both roles use
templates/pdf/       print layouts, one per schema version
static/css/          ITCSS layers with BEM naming, no preprocessor
static/img/          logo and icons derived from the Ignite brand mark
```

Django admin is a superuser back door for data repair only. Every screen the
client sees is built to the approved design.

## Interface

One responsive frame serves both roles. Below 64em the navigation is a
slide-over drawer behind a burger; from 64em it is a persistent sidebar and the
dashboards gain a right-hand rail. The records table becomes one labelled card
per record below 64em rather than scrolling sideways, and participant rows
collapse from a card to a single line using container queries, so they reflow to
the panel they sit in rather than to the viewport.

Support workers get Today's shift, Participants and Notices. Managers get a
service overview with completion by property, an outstanding queue, recent
submissions and quick actions, plus Records, Properties and Care workers.

The logo is the real Ignite lockup, keyed off its white background from the
brand JPG and served as WebP, with PNG app icons generated from the flame mark.

## Not built yet

- **SharePoint sync.** The intended shape is a queued job pushing to Microsoft
  Graph with app-only auth and `Sites.Selected` scoped to one site,
  regenerate-and-replace rather than append. A SharePoint outage must never
  block a submission.
- **Seizure Observation Chart** as the second form. The schema engine is built
  for it; this is where it proves itself.
- **Amendment UI.** The model and PDF rendering exist; the screen does not.
- **Offline submission.** Drafts persist to `localStorage` so nothing typed is
  lost, but submitting needs connectivity. Full offline sync was deliberately
  deferred pending a wifi check in the homes.
- **Create and edit screens** for participants, care workers, properties and
  notices. The list and detail screens exist; adding and editing is still
  Django admin.
- **Two-factor enrolment screens.** django-otp is installed and wired.
