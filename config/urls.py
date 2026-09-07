from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.contrib.auth import views as auth_views
from django.urls import path

from apps.exports import views as export_views
from apps.people import views as people_views
from apps.records import views as record_views

urlpatterns = [
    path("", people_views.dashboard, name="dashboard"),
    path("home/<int:home_id>/", people_views.switch_home, name="switch_home"),
    path("participants/", people_views.participant_list, name="participant_list"),
    path("participant/<int:pk>/", people_views.participant_detail, name="participant_detail"),
    path("notices/", people_views.notice_list, name="notice_list"),
    path("properties/", people_views.property_list, name="property_list"),
    path("care-workers/", people_views.worker_list, name="worker_list"),
    path("participant/<int:pk>/book.pdf", record_views.participant_book, name="participant_book"),
    path("participant/<int:participant_id>/record/new/", record_views.record_new, name="record_new"),
    path(
        "participant/<int:participant_id>/record/not-required/",
        record_views.record_not_required,
        name="record_not_required",
    ),
    path("record/<int:pk>/edit/", record_views.record_edit, name="record_edit"),
    path("record/<int:pk>/", record_views.record_detail, name="record_detail"),
    path("record/<int:pk>/pdf/", record_views.record_pdf, name="record_pdf"),
    path("records/", export_views.record_list, name="record_list"),
    path("records/drawer/<int:pk>/", export_views.record_drawer, name="record_drawer"),
    path("records/export.csv", export_views.export_csv, name="export_csv"),
    path("records/export.xlsx", export_views.export_xlsx, name="export_xlsx"),
    path("records/selection.pdf", export_views.export_pdf, name="export_pdf"),
    path(
        "login/",
        auth_views.LoginView.as_view(template_name="registration/login.html", redirect_authenticated_user=True),
        name="login",
    ),
    path("logout/", auth_views.LogoutView.as_view(), name="logout"),
    path("django-admin/", admin.site.urls),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
