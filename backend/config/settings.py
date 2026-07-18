from pathlib import Path

from environs import Env

BASE_DIR = Path(__file__).resolve().parent.parent

env = Env()
env.read_env(BASE_DIR.parent / ".env")

SECRET_KEY = env.str("DJANGO_SECRET_KEY")
DEBUG = env.bool("DJANGO_DEBUG", False)
ALLOWED_HOSTS: list[str] = env.list("DJANGO_ALLOWED_HOSTS", [])

DATA_DIR = env.path("IN_TIME_DATA_DIR", BASE_DIR.parent / "data")
SCHEDULE_RELOAD_COMMAND: list[str] = env.list("IN_TIME_RELOAD_COMMAND", [])

# Only used on DEBUG. In Prod, nginx makes the request and sets the Referer.
TILE_REFERER = env.str("IN_TIME_TILE_REFERER", "")

INSTALLED_APPS = [
    "django.contrib.contenttypes",
    "django.contrib.staticfiles",
    "pipeline",
    "web",
]

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {"context_processors": []},
    },
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"
WSGI_APPLICATION = "config.wsgi.application"

DATABASES = {"default": env.dj_db_url("DATABASE_URL")}

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR.parent / "staticfiles"
STATICFILES_DIRS = [BASE_DIR.parent / "frontend"]

if not DEBUG:
    SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True

# HSTS (W004) and the http->https redirect (W008) are owned by nginx, not the
# app, so check --deploy stays a meaningful gate instead of a permanent warning.
SILENCED_SYSTEM_CHECKS = ["security.W004", "security.W008"]

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

USE_TZ = True
TIME_ZONE = "Europe/Zurich"
