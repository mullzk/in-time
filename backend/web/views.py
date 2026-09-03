import hashlib
import json

from django.conf import settings
from django.http import HttpRequest, HttpResponse, JsonResponse
from django.shortcuts import render
from django.views.decorators.http import condition

from pipeline.artifacts import SCHEDULE_RAIL_BLOB_NAME, SCHEDULE_ROAD_BLOB_NAME
from pipeline.datadir import DataDir
from web.published import PublishedSchedule

ARTIFACT_URL_PREFIX = "/artifacts/"
RAIL_STATIONS_URL = "/api/stations-rail"
ROAD_STATIONS_URL = "/api/stations-road"


def _published() -> PublishedSchedule:
    return PublishedSchedule(DataDir(settings.DATA_DIR))


def _content_etag(payload: bytes | None) -> str | None:
    if payload is None:
        return None
    return f'W/"{hashlib.sha256(payload).hexdigest()[:16]}"'


def _rail_stations_etag(request: HttpRequest) -> str | None:
    return _content_etag(_published().stations_rail_bytes())


def _road_stations_etag(request: HttpRequest) -> str | None:
    return _content_etag(_published().stations_road_bytes())


# The blob URLs carry the version of the file they address, the way the static
# files carry their content hash: a rebuilt day is a new address, so no client
# can read a cached blob against the station catalog it no longer matches. An
# unversioned name is answered while nothing is published.
def _blob_url(published: PublishedSchedule, name: str) -> str:
    version = published.artifact_version(name)
    return f"{ARTIFACT_URL_PREFIX}{name}" + (f"?v={version}" if version else "")


def _config_body(published: PublishedSchedule, service_date_iso: str) -> dict[str, str]:
    return {
        "serviceDate": service_date_iso,
        "railScheduleBlobUrl": _blob_url(published, SCHEDULE_RAIL_BLOB_NAME),
        "roadScheduleBlobUrl": _blob_url(published, SCHEDULE_ROAD_BLOB_NAME),
        "railStationsUrl": RAIL_STATIONS_URL,
        "roadStationsUrl": ROAD_STATIONS_URL,
    }


# The published content can change while the service day stays the same (a code
# deploy alters the config URLs; a rebuild re-emits the same day's stations with
# new fields), so a day-keyed ETag would let `no-cache` revalidation answer 304
# and strand clients on a stale body. Key every endpoint to its payload instead.
def _config_etag(request: HttpRequest) -> str | None:
    published = _published()
    service_date = published.service_date()
    if service_date is None:
        return None
    body = json.dumps(_config_body(published, service_date.isoformat()), sort_keys=True)
    return _content_etag(body.encode())


def _no_publication() -> HttpResponse:
    return JsonResponse({"detail": "no schedule published"}, status=503)


def _revalidated(response: HttpResponse) -> HttpResponse:
    response["Cache-Control"] = "public, no-cache"
    return response


@condition(etag_func=_config_etag)
def config(request: HttpRequest) -> HttpResponse:
    published = _published()
    service_date = published.service_date()
    if service_date is None:
        return _no_publication()
    return _revalidated(JsonResponse(_config_body(published, service_date.isoformat())))


@condition(etag_func=_rail_stations_etag)
def stations_rail(request: HttpRequest) -> HttpResponse:
    payload = _published().stations_rail_bytes()
    if payload is None:
        return _no_publication()
    return _revalidated(HttpResponse(payload, content_type="application/json"))


@condition(etag_func=_road_stations_etag)
def stations_road(request: HttpRequest) -> HttpResponse:
    payload = _published().stations_road_bytes()
    if payload is None:
        return _no_publication()
    return _revalidated(HttpResponse(payload, content_type="application/json"))


# A view carries the station it opens on in its own address, so that a picture
# can be linked to. Which station that is only the client can tell, from the
# catalog it loads; the server has to answer the address, nothing more.
def takt(request: HttpRequest, station: str = "") -> HttpResponse:
    return render(request, "web/takt.html")


def kaskade(request: HttpRequest, station: str = "") -> HttpResponse:
    return render(request, "web/kaskade.html")


def zeitkarte(request: HttpRequest, station: str = "") -> HttpResponse:
    return render(request, "web/zeitkarte.html")
