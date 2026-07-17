import json
from datetime import date
from pathlib import Path

from pipeline.artifacts import STATIONS_NAME
from pipeline.datadir import DataDir
from web.published import PublishedSchedule


def _publish(root: Path, service_date: date, stations: bytes | None) -> DataDir:
    data_dir = DataDir(root)
    artifact_dir = data_dir.artifact_dir(service_date)
    artifact_dir.mkdir(parents=True, exist_ok=True)
    if stations is not None:
        (artifact_dir / STATIONS_NAME).write_bytes(stations)
    data_dir.publish(service_date)
    return data_dir


def test_service_date_reads_the_current_symlink(tmp_path: Path) -> None:
    data_dir = _publish(tmp_path, date(2026, 7, 16), b"[]")

    assert PublishedSchedule(data_dir).service_date() == date(2026, 7, 16)


def test_service_date_is_none_without_current(tmp_path: Path) -> None:
    assert PublishedSchedule(DataDir(tmp_path)).service_date() is None


def test_stations_bytes_returns_file_content(tmp_path: Path) -> None:
    payload = json.dumps([{"didok": 8_507_000, "name": "Bern"}]).encode("utf-8")
    data_dir = _publish(tmp_path, date(2026, 7, 16), payload)

    assert PublishedSchedule(data_dir).stations_bytes() == payload


def test_stations_bytes_is_none_when_missing(tmp_path: Path) -> None:
    data_dir = _publish(tmp_path, date(2026, 7, 16), None)

    assert PublishedSchedule(data_dir).stations_bytes() is None
