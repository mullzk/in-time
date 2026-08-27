from django.urls import path
from django.views.generic.base import RedirectView

from web import views

urlpatterns = [
    path("", RedirectView.as_view(url="/takt", permanent=False)),
    path("api/config", views.config),
    path("api/stations-rail", views.stations_rail),
    path("api/stations-road", views.stations_road),
    path("takt", views.takt),
    path("takt/", views.takt),
    path("takt/<str:station>", views.takt),
    path("ausbreitung", views.ausbreitung),
    path("ausbreitung/", views.ausbreitung),
    path("ausbreitung/<str:station>", views.ausbreitung),
    path("reisezeit", views.reisezeit),
    path("reisezeit/", views.reisezeit),
    path("reisezeit/<str:station>", views.reisezeit),
]
