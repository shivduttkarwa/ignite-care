from .base import *  # noqa: F403

DEBUG = True
# Development only. Lets you open the portal from a phone on the same wi-fi.
ALLOWED_HOSTS = ["*"]
CSRF_TRUSTED_ORIGINS = [
    "http://localhost:8811",
    "http://127.0.0.1:8811",
    "http://192.168.*.*:8811",
    "http://10.*.*.*:8811",
]
EMAIL_BACKEND = "django.core.mail.backends.console.EmailBackend"
AXES_ENABLED = False

# The hashed-manifest backend needs collectstatic to have run; plain storage in dev.
STORAGES = {
    "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
    "staticfiles": {"BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage"},
}

# The Vite dev server runs on its own port, so development is cross-origin even
# though production is not. Cookies still work because credentials are allowed
# and both are on localhost.
CORS_ALLOWED_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]
CSRF_TRUSTED_ORIGINS += ["http://localhost:5173", "http://127.0.0.1:5173"]
