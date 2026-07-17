from django.urls import include, path

from config.views import health

urlpatterns = [
    path("health/", health),
    path("", include("web.urls")),
]
