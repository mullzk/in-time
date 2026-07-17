from django.urls import path

from web import views

urlpatterns = [
    path("api/config", views.config),
    path("api/stations", views.stations),
    path("herzschlag", views.herzschlag),
]
