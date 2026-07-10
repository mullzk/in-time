from pathlib import Path

from environs import Env

BASE_DIR = Path(__file__).resolve().parent.parent

env = Env()
env.read_env(BASE_DIR.parent / ".env")

SECRET_KEY = env.str("DJANGO_SECRET_KEY")
DEBUG = env.bool("DJANGO_DEBUG", False)
ALLOWED_HOSTS: list[str] = env.list("DJANGO_ALLOWED_HOSTS", [])

DATA_DIR = env.path("IN_TIME_DATA_DIR", BASE_DIR.parent / "data")

INSTALLED_APPS = [
    "django.contrib.contenttypes",
    "django.contrib.staticfiles",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "django.middleware.common.CommonMiddleware",
]

ROOT_URLCONF = "config.urls"
WSGI_APPLICATION = "config.wsgi.application"

DATABASES = {"default": env.dj_db_url("DATABASE_URL")}

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR.parent / "staticfiles"

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

USE_TZ = True
TIME_ZONE = "Europe/Zurich"
