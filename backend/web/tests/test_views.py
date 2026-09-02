import json
from datetime import date
from pathlib import Path

import pytest
from django.test import Client
from pytest_django.fixtures import SettingsWrapper

from pipeline.artifacts import (
    SCHEDULE_RAIL_BLOB_NAME,
    SCHEDULE_ROAD_BLOB_NAME,
    STATIONS_RAIL_NAME,
    STATIONS_ROAD_NAME,
)
from pipeline.datadir import DataDir

STATIONS = json.dumps([{"didok": 8_507_000, "name": "Bern"}]).encode("utf-8")
STATIONS_ROAD = json.dumps([{"didok": 8_500_100, "name": "Basel, Bahnhof"}]).encode(
    "utf-8"
)


def _publish(root: Path, service_date: date, blob: bytes = b"itsb") -> None:
    data_dir = DataDir(root)
    artifact_dir = data_dir.artifact_dir(service_date)
    artifact_dir.mkdir(parents=True, exist_ok=True)
    (artifact_dir / STATIONS_RAIL_NAME).write_bytes(STATIONS)
    (artifact_dir / STATIONS_ROAD_NAME).write_bytes(STATIONS_ROAD)
    (artifact_dir / SCHEDULE_RAIL_BLOB_NAME).write_bytes(blob)
    (artifact_dir / SCHEDULE_ROAD_BLOB_NAME).write_bytes(blob)
    data_dir.publish(service_date)


@pytest.fixture
def published(tmp_path: Path, settings: SettingsWrapper) -> Path:
    settings.DATA_DIR = tmp_path
    _publish(tmp_path, date(2026, 7, 16))
    return tmp_path


def test_config_returns_the_published_day(client: Client, published: Path) -> None:
    response = client.get("/api/config")

    assert response.status_code == 200
    body = response.json()
    assert body["serviceDate"] == "2026-07-16"
    assert body["railScheduleBlobUrl"].startswith("/artifacts/schedule-rail.itsb?v=")
    assert body["roadScheduleBlobUrl"].startswith("/artifacts/schedule-road.itsb?v=")
    assert body["railStationsUrl"] == "/api/stations-rail"
    assert body["roadStationsUrl"] == "/api/stations-road"
    assert "no-cache" in response["Cache-Control"]
    assert response.has_header("ETag")


def test_config_is_503_without_publication(
    client: Client, settings: SettingsWrapper, tmp_path: Path
) -> None:
    settings.DATA_DIR = tmp_path

    response = client.get("/api/config")

    assert response.status_code == 503
    assert response.json()["detail"]


def test_stations_rail_passes_the_artifact_through(
    client: Client, published: Path
) -> None:
    response = client.get("/api/stations-rail")

    assert response.status_code == 200
    assert response["Content-Type"].startswith("application/json")
    assert response.content == STATIONS
    assert "no-cache" in response["Cache-Control"]


def test_stations_road_passes_the_artifact_through(
    client: Client, published: Path
) -> None:
    response = client.get("/api/stations-road")

    assert response.status_code == 200
    assert response.content == STATIONS_ROAD


def test_stations_rail_is_503_without_publication(
    client: Client, settings: SettingsWrapper, tmp_path: Path
) -> None:
    settings.DATA_DIR = tmp_path

    assert client.get("/api/stations-rail").status_code == 503


def test_api_revalidates_across_a_swap(client: Client, published: Path) -> None:
    etag = client.get("/api/config")["ETag"]

    not_modified = client.get("/api/config", HTTP_IF_NONE_MATCH=etag)
    assert not_modified.status_code == 304

    _publish(published, date(2026, 7, 17))
    after_swap = client.get("/api/config", HTTP_IF_NONE_MATCH=etag)
    assert after_swap.status_code == 200
    assert after_swap.json()["serviceDate"] == "2026-07-17"


# A day rebuilt from the same sources keeps its name, so only the blob URL can
# tell a client that what sits behind it has changed.
def test_a_rebuilt_blob_gets_a_new_url(client: Client, published: Path) -> None:
    first = client.get("/api/config")
    before = first.json()["railScheduleBlobUrl"]

    _publish(published, date(2026, 7, 16), blob=b"itsb rebuilt")
    after_rebuild = client.get("/api/config", HTTP_IF_NONE_MATCH=first["ETag"])

    assert after_rebuild.status_code == 200
    assert after_rebuild.json()["railScheduleBlobUrl"] != before


def test_stations_etag_tracks_content_not_only_the_day(
    client: Client, published: Path
) -> None:
    etag = client.get("/api/stations-rail")["ETag"]
    assert client.get("/api/stations-rail", HTTP_IF_NONE_MATCH=etag).status_code == 304

    # A rebuild of the same day with new content (stations gaining a modes field)
    # must invalidate the cache, or no-cache revalidation strands a stale body.
    artifact_dir = DataDir(published).artifact_dir(date(2026, 7, 16))
    (artifact_dir / STATIONS_RAIL_NAME).write_bytes(
        json.dumps([{"didok": 8_507_000, "name": "Bern", "modes": ["rail"]}]).encode()
    )

    after_rebuild = client.get("/api/stations-rail", HTTP_IF_NONE_MATCH=etag)
    assert after_rebuild.status_code == 200
    assert json.loads(after_rebuild.content)[0]["modes"] == ["rail"]


def test_rail_and_road_stations_have_distinct_etags(
    client: Client, published: Path
) -> None:
    rail_etag = client.get("/api/stations-rail")["ETag"]
    road_etag = client.get("/api/stations-road")["ETag"]

    assert rail_etag != road_etag


def test_taktfahrplan_serves_the_html_shell(client: Client, published: Path) -> None:
    response = client.get("/taktfahrplan")

    assert response.status_code == 200
    assert response["Content-Type"].startswith("text/html")
    markup = response.content.decode("utf-8")
    assert "/api/config" in markup
    assert "/static/" in markup


def test_zeitkarte_serves_its_own_shell(client: Client, published: Path) -> None:
    response = client.get("/zeitkarte")

    assert response.status_code == 200
    markup = response.content.decode("utf-8")
    assert "/api/config" in markup
    assert "zeitkarte/main" in markup


def test_reisefaecher_serves_its_own_shell(client: Client, published: Path) -> None:
    response = client.get("/reisefaecher")

    assert response.status_code == 200
    markup = response.content.decode("utf-8")
    assert "/api/config" in markup
    assert "reisefaecher/main" in markup


@pytest.mark.parametrize(
    ("address", "script"),
    [
        ("/taktfahrplan/bern", "taktfahrplan/main"),
        ("/zeitkarte/bern-b%C3%BCmpliz-nord", "zeitkarte/main"),
        ("/reisefaecher/z%C3%BCrich-hb", "reisefaecher/main"),
    ],
)
def test_a_station_in_the_address_serves_the_same_shell(
    client: Client, published: Path, address: str, script: str
) -> None:
    response = client.get(address)

    assert response.status_code == 200
    assert script in response.content.decode("utf-8")


@pytest.mark.parametrize(
    ("former_address", "current_address"),
    [
        ("/takt", "/taktfahrplan"),
        ("/takt/", "/taktfahrplan"),
        ("/ausbreitung", "/reisefaecher"),
        ("/ausbreitung/", "/reisefaecher"),
        ("/reisezeit", "/zeitkarte"),
        ("/reisezeit/", "/zeitkarte"),
        ("/takt/bern", "/taktfahrplan/bern"),
        ("/ausbreitung/z%C3%BCrich-hb", "/reisefaecher/z%C3%BCrich-hb"),
        ("/reisezeit/bern-b%C3%BCmpliz-nord", "/zeitkarte/bern-b%C3%BCmpliz-nord"),
    ],
)
def test_a_former_view_name_is_permanently_moved(
    client: Client, former_address: str, current_address: str
) -> None:
    response = client.get(former_address)

    assert response.status_code == 301
    assert response["Location"] == current_address


def test_a_redirect_keeps_the_exhibition_mode(client: Client) -> None:
    response = client.get("/takt/bern?mode=exhibition")

    assert response["Location"] == "/taktfahrplan/bern?mode=exhibition"
