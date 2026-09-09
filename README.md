# Ignite Support Worker Portal

Replaces the handwritten daily care record books used across Ignite Community
Services' residential homes. Support workers lodge a record each shift, every
record renders to a PDF at submission, and a participant's whole book can be
compiled from those PDFs on demand.

## Stack

The front end and the back end are separate programs that speak JSON.

**Back end** - Python 3.12, Django 5.2 LTS with Django REST Framework,
PostgreSQL in production and SQLite in development. It serves `/api/` and
nothing else: no HTML pages, no templates except the print layouts. WeasyPrint
renders the PDFs and pypdf compiles the books. django-simple-history keeps
record history, django-otp provides TOTP two-factor and django-axes handles
lockout.

**Front end** - React 18 with TypeScript, Vite, React Router and TanStack Query.
Native CSS in ITCSS layers with BEM naming; no preprocessor, no utility
framework. Fonts are self-hosted Barlow.

Sign-in uses a **session cookie, not a token**. The cookie is `httpOnly`, so no
script can read it and a cross-site script cannot walk off with a credential -
which matters more here than usual, because this is health data. That works
because in production both halves are served from **one origin**: Caddy serves
the built React files at `/` and reverse-proxies `/api` to gunicorn. One box,
one certificate, one cookie. A future native app authenticates with a token
instead, which DRF can issue alongside the session without changing anything the
web client does.

## The four decisions the design rests on

**Forms are data, not code.** Each form is a versioned JSON schema in
`forms/schemas/`, served over the API at `/api/schemas/<key>/<version>/`. React
draws the web form from it; a Django template draws the PDF from it. Adding the
Bowel Chart is a new schema plus a print template - no new model, migration,
view or screen. A future native app reads the same schema and gets the same form
for free.

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

Requires Python 3.12, [uv](https://docs.astral.sh/uv/) and Node 20.

```bash
uv venv --python 3.12 .venv
uv sync
cp .env.example .env
.venv/Scripts/python manage.py migrate
.venv/Scripts/python manage.py seed_demo --days 12
.venv/Scripts/python manage.py runserver 127.0.0.1:8811
```

In a second terminal:

```bash
cd frontend
npm install
npm run dev
```

Open **http://127.0.0.1:5173**. That is the app. Vite proxies `/api` and
`/media` through to Django on 8811, so the browser sees one origin in
development too and the session cookie behaves exactly as it will in production.

Django on 8811 answers only `/api/` and `/django-admin/`. Opening its root
returns 404, which is correct.

### Production

One machine. `npm run build` produces `frontend/dist`; Caddy serves that at `/`
with an SPA fallback and proxies `/api` to gunicorn. Two processes, one origin,
one certificate - not two servers.

### Testing on a phone

Both processes have to listen on the LAN, not just on loopback:

```bash
.venv/Scripts/python manage.py runserver 0.0.0.0:8811
cd frontend && npm run dev -- --host 0.0.0.0
```

Then open `http://<machine-ip>:5173` from a device on the same wi-fi.
`config/settings/local.py` sets `ALLOWED_HOSTS = ["*"]` for this. It is a
development-only file; `production.py` still requires an explicit host list.

Guest and hotel wi-fi usually has client isolation switched on, which stops
devices reaching each other whatever the firewall says. If the phone cannot load
the page, rule that out first.

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
.venv/Scripts/python -m pytest      # back end
cd frontend && npx tsc --noEmit     # front end types
```

52 tests cover the things that must not break: shift date attribution across
midnight, conditional visibility and validation in the schema engine, submission
locking a record and storing its PDF, hidden answers never being persisted,
promoted columns tracking the answers, a worker in one home being unable to
reach a participant in another, the participants list reporting the current
shift's state so nobody is recorded twice, book compilation, exports carrying
exactly the rows the screen showed, and role-correct dashboards.

## Layout

```
config/settings/         base.py -> local.py and production.py
apps/api/                the whole HTTP surface: views, serializers, auth, exports
apps/people/             Home, Participant, ConditionTag, StaffProfile
apps/records/            CareRecord, schema engine, shift services, filters
apps/notices/            Notice and read tracking
apps/pdfgen/             WeasyPrint rendering and book compilation
forms/schemas/           versioned form definitions
templates/pdf/           print layouts, one per schema version

frontend/src/api/        typed fetch client and the API's type surface
frontend/src/screens/    one file per screen
frontend/src/components/ the app frame and the shared pieces
frontend/src/styles/     ITCSS layers with BEM naming, no preprocessor
frontend/public/         logo, icons and fonts
```

Django admin is a superuser back door for data repair only. Every screen the
client sees is React, built to the approved design.

## Interface

One responsive frame serves both roles. Below 64em the navigation is a
slide-over drawer behind a burger; from 64em it is a persistent sidebar and the
dashboards gain a right-hand rail. The records table becomes one labelled card
per record below 64em rather than scrolling sideways, and participant rows
collapse from a card to a single line using container queries, so they reflow to
the panel they sit in rather than to the viewport.

Manager-only screens are refused by the API and redirected by the router, so a
support worker who types or bookmarks `/records` lands back on their own shift
rather than on an error.

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
- **PDF preview screen** (screen 6 of the approved design). The PDF downloads;
  previewing it in the browser before saving does not exist yet.
- **Two-factor enrolment screens.** django-otp is installed and wired.
