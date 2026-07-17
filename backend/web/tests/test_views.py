import json
from datetime import date
from pathlib import Path

import pytest
from django.test import Client
from pytest_django.fixtures import SettingsWrapper

from pipeline.artifacts import STATIONS_NAME
from pipeline.datadir import DataDir

STATIONS = json.dumps([{"didok": 8_507_000, "name": "Bern"}]).encode("utf-8")


def _publish(root: Path, service_date: date) -> None:
    data_dir = DataDir(root)
    artifact_dir = data_dir.artifact_dir(service_date)
    artifact_dir.mkdir(parents=True, exist_ok=True)
    (artifact_dir / STATIONS_NAME).write_bytes(STATIONS)
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
    assert body["scheduleBlobUrl"] == "/artifacts/current/schedule.itsb"
    assert body["stationsUrl"] == "/api/stations"
    assert "no-cache" in response["Cache-Control"]
    assert response.has_header("ETag")


def test_config_is_503_without_publication(
    client: Client, settings: SettingsWrapper, tmp_path: Path
) -> None:
    settings.DATA_DIR = tmp_path

    response = client.get("/api/config")

    assert response.status_code == 503
    assert response.json()["detail"]


def test_stations_passes_the_artifact_through(client: Client, published: Path) -> None:
    response = client.get("/api/stations")

    assert response.status_code == 200
    assert response["Content-Type"].startswith("application/json")
    assert response.content == STATIONS
    assert "no-cache" in response["Cache-Control"]


def test_stations_is_503_without_publication(
    client: Client, settings: SettingsWrapper, tmp_path: Path
) -> None:
    settings.DATA_DIR = tmp_path

    assert client.get("/api/stations").status_code == 503


def test_api_revalidates_across_a_swap(client: Client, published: Path) -> None:
    etag = client.get("/api/config")["ETag"]

    not_modified = client.get("/api/config", HTTP_IF_NONE_MATCH=etag)
    assert not_modified.status_code == 304

    _publish(published, date(2026, 7, 17))
    after_swap = client.get("/api/config", HTTP_IF_NONE_MATCH=etag)
    assert after_swap.status_code == 200
    assert after_swap.json()["serviceDate"] == "2026-07-17"


def test_herzschlag_serves_the_html_shell(client: Client, published: Path) -> None:
    response = client.get("/herzschlag")

    assert response.status_code == 200
    assert response["Content-Type"].startswith("text/html")
    markup = response.content.decode("utf-8")
    assert "/api/config" in markup
    assert "/static/" in markup
