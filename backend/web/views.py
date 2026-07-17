from django.conf import settings
from django.http import HttpRequest, HttpResponse, JsonResponse
from django.shortcuts import render
from django.views.decorators.http import condition

from pipeline.datadir import DataDir
from web.published import PublishedSchedule

SCHEDULE_BLOB_URL = "/artifacts/current/schedule.itsb"
STATIONS_URL = "/api/stations"


def _published() -> PublishedSchedule:
    return PublishedSchedule(DataDir(settings.DATA_DIR))


def _published_etag(request: HttpRequest) -> str | None:
    service_date = _published().service_date()
    if service_date is None:
        return None
    return f'W/"{service_date.isoformat()}"'


def _no_publication() -> HttpResponse:
    return JsonResponse({"detail": "no schedule published"}, status=503)


def _revalidated(response: HttpResponse) -> HttpResponse:
    response["Cache-Control"] = "public, no-cache"
    return response


@condition(etag_func=_published_etag)
def config(request: HttpRequest) -> HttpResponse:
    service_date = _published().service_date()
    if service_date is None:
        return _no_publication()
    return _revalidated(
        JsonResponse(
            {
                "serviceDate": service_date.isoformat(),
                "scheduleBlobUrl": SCHEDULE_BLOB_URL,
                "stationsUrl": STATIONS_URL,
            }
        )
    )


@condition(etag_func=_published_etag)
def stations(request: HttpRequest) -> HttpResponse:
    payload = _published().stations_bytes()
    if payload is None:
        return _no_publication()
    return _revalidated(HttpResponse(payload, content_type="application/json"))


def herzschlag(request: HttpRequest) -> HttpResponse:
    return render(request, "web/herzschlag.html")
