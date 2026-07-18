import urllib.request

from django.conf import settings
from django.http import Http404, HttpRequest, HttpResponse

_TILE_LAYERS = frozenset(
    {
        "ch.swisstopo.pixelkarte-farbe",
        "ch.swisstopo.pixelkarte-grau",
        "ch.swisstopo.swissalti3d-reliefschattierung",
        "ch.swisstopo.swissimage",
    }
)
_TILE_FORMATS = frozenset({"jpeg", "png"})
_TILE_UPSTREAM = (
    "https://wmts.geo.admin.ch/1.0.0/{layer}/default/current/2056/{z}/{x}/{y}.{ext}"
)
_TILE_TIMEOUT_SECONDS = 10


def health(request: HttpRequest) -> HttpResponse:
    return HttpResponse("ok", content_type="text/plain")


def tile_proxy(
    request: HttpRequest, layer: str, z: int, x: int, y: int, ext: str
) -> HttpResponse:
    if not settings.DEBUG:
        raise Http404
    if layer not in _TILE_LAYERS or ext not in _TILE_FORMATS:
        raise Http404

    url = _TILE_UPSTREAM.format(layer=layer, z=z, x=x, y=y, ext=ext)
    headers = {"Referer": settings.TILE_REFERER} if settings.TILE_REFERER else {}
    upstream = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(upstream, timeout=_TILE_TIMEOUT_SECONDS) as response:
        return HttpResponse(
            response.read(), content_type=response.headers.get("Content-Type")
        )
