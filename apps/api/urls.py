from django.urls import path

from . import auth as auth_views
from . import exports as export_views
from . import views

app_name = "api"

urlpatterns = [
    # Session
    path("auth/login/", auth_views.login_view, name="login"),
    path("auth/logout/", auth_views.logout_view, name="logout"),
    path("auth/csrf/", auth_views.csrf_view, name="csrf"),
    path("me/", views.MeView.as_view(), name="me"),
    # Service
    path("homes/", views.homes, name="homes"),
    path("homes/switch/", views.switch_home, name="switch-home"),
    path("shifts/", views.shifts, name="shifts"),
    path("workers/", views.workers, name="workers"),
    path("properties/", views.properties, name="properties"),
    # Forms
    path("schemas/", views.schema_list, name="schema-list"),
    path("schemas/<str:key>/<str:version>/", views.schema_detail, name="schema-detail"),
    # Participants
    path("participants/", views.participant_list, name="participant-list"),
    path("participants/<int:pk>/", views.participant_detail, name="participant-detail"),
    path("participants/<int:pk>/records/", views.participant_records, name="participant-records"),
    path("participants/<int:pk>/book.pdf", views.participant_book, name="participant-book"),
    # Records
    path("records/", views.record_list, name="record-list"),
    # Files, reusing the manager screen exports. Same filters, same rows.
    path("records/export.csv", export_views.export_csv, name="export-csv"),
    path("records/export.xlsx", export_views.export_xlsx, name="export-xlsx"),
    path("records/selection.pdf", export_views.export_pdf, name="export-pdf"),
    path("records/start/", views.record_start, name="record-start"),
    path("records/not-required/", views.record_not_required, name="record-not-required"),
    path("records/<int:pk>/", views.record_detail, name="record-detail"),
    path("records/<int:pk>/draft/", views.record_save_draft, name="record-draft"),
    path("records/<int:pk>/submit/", views.record_submit, name="record-submit"),
    path("records/<int:pk>/pdf/", views.record_pdf, name="record-pdf"),
    # Notices
    path("notices/", views.notice_list, name="notice-list"),
    path("notices/read/", views.notice_mark_read, name="notice-read"),
    # Dashboard
    path("dashboard/", views.dashboard, name="dashboard"),
]
