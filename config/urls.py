"""URL map.

Django serves a JSON API and generated PDFs. The user interface is the React
app in frontend/, served by Caddy at / in production and by Vite in
development. There are no HTML views here beyond Django's own admin, which is
a superuser back door for data repair, not a client-facing screen.
"""

from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path

urlpatterns = [
    path("api/", include("apps.api.urls")),
    path("django-admin/", admin.site.urls),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
