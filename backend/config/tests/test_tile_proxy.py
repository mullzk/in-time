from unittest.mock import MagicMock, patch

import pytest
from django.http import Http404, HttpResponse
from django.test import RequestFactory, override_settings

from config.views import tile_proxy

RELIEF = "ch.swisstopo.swissalti3d-reliefschattierung"


def _upstream(body: bytes = b"PNGDATA", content_type: str = "image/png") -> MagicMock:
    response = MagicMock()
    response.read.return_value = body
    response.headers = {"Content-Type": content_type}
    urlopen = MagicMock()
    urlopen.return_value.__enter__.return_value = response
    return urlopen


def _get(
    layer: str = RELIEF, z: int = 16, x: int = 2, y: int = 2, ext: str = "png"
) -> HttpResponse:
    request = RequestFactory().get("/tiles/")
    return tile_proxy(request, layer=layer, z=z, x=x, y=y, ext=ext)


@override_settings(DEBUG=True, TILE_REFERER="")
def test_rejects_layer_outside_the_whitelist() -> None:
    with patch("config.views.urllib.request.urlopen") as urlopen:
        with pytest.raises(Http404):
            _get(layer="ch.swisstopo.evil")
    urlopen.assert_not_called()


@override_settings(DEBUG=True, TILE_REFERER="")
def test_rejects_unknown_tile_format() -> None:
    with patch("config.views.urllib.request.urlopen") as urlopen:
        with pytest.raises(Http404):
            _get(ext="gif")
    urlopen.assert_not_called()


@override_settings(DEBUG=True, TILE_REFERER="https://tiles.example/")
def test_forwards_to_swisstopo_with_referer_and_passes_bytes_through() -> None:
    with patch("config.views.urllib.request.urlopen", _upstream()) as urlopen:
        response = _get(z=23, x=351, y=292)
    sent = urlopen.call_args.args[0]
    assert sent.full_url == (
        f"https://wmts.geo.admin.ch/1.0.0/{RELIEF}/default/current/2056/23/351/292.png"
    )
    assert sent.get_header("Referer") == "https://tiles.example/"
    assert response.status_code == 200
    assert response.content == b"PNGDATA"
    assert response["Content-Type"] == "image/png"


@override_settings(DEBUG=True, TILE_REFERER="")
def test_omits_referer_when_unconfigured() -> None:
    with patch("config.views.urllib.request.urlopen", _upstream()) as urlopen:
        _get()
    assert urlopen.call_args.args[0].get_header("Referer") is None


@override_settings(DEBUG=False, TILE_REFERER="")
def test_refuses_outside_debug() -> None:
    with patch("config.views.urllib.request.urlopen") as urlopen:
        with pytest.raises(Http404):
            _get()
    urlopen.assert_not_called()
