from django.urls import URLPattern, path
from django.views.generic.base import RedirectView

from web import views


# The views were renamed after links to them were already shared, so the old
# names stay answerable: permanently moved, carrying over the station in the
# path and the query string the kiosk mode is asked for with.
def _redirects_from_the_former_name(
    former_name: str, current_name: str
) -> list[URLPattern]:
    moved = RedirectView.as_view(
        url=f"/{current_name}", permanent=True, query_string=True
    )
    moved_with_station = RedirectView.as_view(
        url=f"/{current_name}/%(station)s", permanent=True, query_string=True
    )
    return [
        path(former_name, moved),
        path(f"{former_name}/", moved),
        path(f"{former_name}/<str:station>", moved_with_station),
    ]


urlpatterns = [
    path("", RedirectView.as_view(url="/taktfahrplan", permanent=False)),
    path("api/config", views.config),
    path("api/stations-rail", views.stations_rail),
    path("api/stations-road", views.stations_road),
    path("taktfahrplan", views.taktfahrplan),
    path("taktfahrplan/", views.taktfahrplan),
    path("taktfahrplan/<str:station>", views.taktfahrplan),
    path("reisefaecher", views.reisefaecher),
    path("reisefaecher/", views.reisefaecher),
    path("reisefaecher/<str:station>", views.reisefaecher),
    path("zeitkarte", views.zeitkarte),
    path("zeitkarte/", views.zeitkarte),
    path("zeitkarte/<str:station>", views.zeitkarte),
    *_redirects_from_the_former_name("takt", "taktfahrplan"),
    *_redirects_from_the_former_name("ausbreitung", "reisefaecher"),
    *_redirects_from_the_former_name("reisezeit", "zeitkarte"),
]
