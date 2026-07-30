from django.urls import path
from django.views.generic.base import RedirectView

from web import views

urlpatterns = [
    path("", RedirectView.as_view(url="/herzschlag", permanent=False)),
    path("api/config", views.config),
    path("api/stations-rail", views.stations_rail),
    path("api/stations-road", views.stations_road),
    path("herzschlag", views.herzschlag),
]
