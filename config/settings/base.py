from pathlib import Path

import environ
from django.templatetags.static import static
from django.urls import reverse_lazy

BASE_DIR = Path(__file__).resolve().parent.parent.parent

env = environ.Env(DJANGO_DEBUG=(bool, False))
environ.Env.read_env(BASE_DIR / ".env")

SECRET_KEY = env("DJANGO_SECRET_KEY", default="insecure-development-key")
DEBUG = env("DJANGO_DEBUG")
ALLOWED_HOSTS = env.list("DJANGO_ALLOWED_HOSTS", default=["localhost", "127.0.0.1"])

INSTALLED_APPS = [
    "unfold",
    "unfold.contrib.filters",
    "unfold.contrib.forms",
    "unfold.contrib.simple_history",
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "django_filters",
    "rest_framework",
    "corsheaders",
    "simple_history",
    "django_otp",
    "django_otp.plugins.otp_totp",
    "axes",
    "apps.api",
    "apps.people",
    "apps.records",
    "apps.notices",
    "apps.pdfgen",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django_otp.middleware.OTPMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
    "simple_history.middleware.HistoryRequestMiddleware",
    "axes.middleware.AxesMiddleware",
    "apps.people.middleware.ActiveHomeMiddleware",
]

ROOT_URLCONF = "config.urls"
WSGI_APPLICATION = "config.wsgi.application"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        # Only the PDF print layouts live here now; the UI is React.
        "DIRS": [BASE_DIR / "templates"],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

DATABASES = {"default": env.db("DATABASE_URL", default=f"sqlite:///{BASE_DIR / 'db.sqlite3'}")}

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {
        "NAME": "django.contrib.auth.password_validation.MinimumLengthValidator",
        "OPTIONS": {"min_length": 10},
    },
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

PASSWORD_HASHERS = [
    "django.contrib.auth.hashers.Argon2PasswordHasher",
    "django.contrib.auth.hashers.PBKDF2PasswordHasher",
]

AUTHENTICATION_BACKENDS = [
    "axes.backends.AxesStandaloneBackend",
    "django.contrib.auth.backends.ModelBackend",
]

LANGUAGE_CODE = "en-au"
TIME_ZONE = env("TIME_ZONE", default="Australia/Brisbane")
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
STATICFILES_DIRS = [BASE_DIR / "static"]
STORAGES = {
    "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
    "staticfiles": {"BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage"},
}
MEDIA_URL = "media/"
MEDIA_ROOT = BASE_DIR / "var" / "media"

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

SESSION_COOKIE_AGE = 60 * 60 * 12
SESSION_EXPIRE_AT_BROWSER_CLOSE = False
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SAMESITE = "Lax"
# The React client has to read this one to echo it back as a header.
CSRF_COOKIE_HTTPONLY = False
CSRF_COOKIE_SAMESITE = "Lax"
X_FRAME_OPTIONS = "DENY"

AXES_FAILURE_LIMIT = 8
AXES_COOLOFF_TIME = 1
AXES_LOCKOUT_PARAMETERS = [["username", "ip_address"]]

SCHEMA_DIR = BASE_DIR / "forms" / "schemas"
WEASYPRINT_DLL_DIR = env("WEASYPRINT_DLL_DIR", default="")

ORGANISATION_NAME = "Ignite Community Services"
RECORD_REF_PREFIX = "IG"

# API ------------------------------------------------------------------------
# Session auth, because the React build is served from the same origin in
# production. That keeps the token in an httpOnly cookie rather than in browser
# storage, which matters for health records. Token auth is added alongside this
# when the mobile app arrives - DRF runs both at once.
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework.authentication.SessionAuthentication",
    ],
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.IsAuthenticated",
    ],
    "DEFAULT_PAGINATION_CLASS": "rest_framework.pagination.PageNumberPagination",
    "PAGE_SIZE": 25,
    "DEFAULT_RENDERER_CLASSES": [
        "rest_framework.renderers.JSONRenderer",
    ],
    "UNAUTHENTICATED_USER": "django.contrib.auth.models.AnonymousUser",
}

# Same origin in production, so no cross-origin requests are allowed by default.
CORS_ALLOWED_ORIGINS = env.list("CORS_ALLOWED_ORIGINS", default=[])
CORS_ALLOW_CREDENTIALS = True

# Django admin ---------------------------------------------------------------
# The admin is where participants, staff, homes and notices are maintained
# until the portal grows its own screens for them, so it carries the brand.
UNFOLD = {
    "SITE_TITLE": "Ignite portal",
    "SITE_HEADER": "Ignite Community Services",
    "SITE_SUBHEADER": "Support worker portal administration",
    "SITE_URL": "/",
    "SITE_ICON": lambda request: static("ignite/logo-mark.webp"),
    "SITE_LOGO": lambda request: static("ignite/logo-full.webp"),
    "SHOW_HISTORY": True,
    "SHOW_VIEW_ON_SITE": False,
    "STYLES": [lambda request: static("ignite/admin.css")],
    "DASHBOARD_CALLBACK": "config.admin_dashboard.cards",
    "COLORS": {
        "primary": {
            "50": "#f2f8fa",
            "100": "#e3eff3",
            "200": "#c7dfe7",
            "300": "#9dc7d5",
            "400": "#5ea2b8",
            "500": "#2b87a6",
            "600": "#1a7695",
            "700": "#115e74",
            "800": "#0d4b5e",
            "900": "#08303d",
            "950": "#062430",
        },
    },
    "SIDEBAR": {
        "show_search": True,
        "show_all_applications": False,
        "navigation": [
            {
                "title": "People",
                "items": [
                    {
                        "title": "Participants",
                        "icon": "groups",
                        "link": reverse_lazy("admin:people_participant_changelist"),
                    },
                    {
                        "title": "Staff accounts",
                        "icon": "badge",
                        "link": reverse_lazy("admin:auth_user_changelist"),
                    },
                    {
                        "title": "Condition tags",
                        "icon": "label",
                        "link": reverse_lazy("admin:people_conditiontag_changelist"),
                    },
                ],
            },
            {
                "title": "Service",
                "separator": True,
                "items": [
                    {
                        "title": "Properties",
                        "icon": "home_work",
                        "link": reverse_lazy("admin:people_home_changelist"),
                    },
                    {
                        "title": "Notices",
                        "icon": "campaign",
                        "link": reverse_lazy("admin:notices_notice_changelist"),
                    },
                ],
            },
            {
                "title": "Records, read only",
                "separator": True,
                "items": [
                    {
                        "title": "Care records",
                        "icon": "description",
                        "link": reverse_lazy("admin:records_carerecord_changelist"),
                    },
                    {
                        "title": "Audit log",
                        "icon": "history",
                        "link": reverse_lazy("admin:records_auditevent_changelist"),
                    },
                ],
            },
        ],
    },
}
