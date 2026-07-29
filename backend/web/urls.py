from django.urls import path

from web import views

urlpatterns = [
    path("api/config", views.config),
    path("api/stations-rail", views.stations_rail),
    path("api/stations-road", views.stations_road),
    path("herzschlag", views.herzschlag),
]
