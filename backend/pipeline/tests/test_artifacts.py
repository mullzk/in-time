import json
from datetime import date
from pathlib import Path

import pytest

from pipeline.artifacts import (
    composite_version,
    locate_gdb,
    reload_runner,
    stations_json,
    write_day_artifacts,
)
from pipeline.schedule_blob import ScheduleDay, read_header
from pipeline.schedule_day import ScheduleBuild, StationEntry


def make_build() -> ScheduleBuild:
    day = ScheduleDay(
        service_date=date(2026, 7, 16),
        stations=[(2_600_000.0, 1_200_000.0), (2_601_000.0, 1_201_000.0)],
        edges=[],
        trips=[],
    )
    stations = [StationEntry(8_507_000, "Bern"), StationEntry(8_501_120, "Lausanne")]
    return ScheduleBuild(day, stations, method_counts={}, straight_fallbacks=[])


def test_composite_version_joins_both_sources() -> None:
    assert composite_version("20260715", "20260716") == (
        "gtfs=20260715;railnet=20260716"
    )


def test_stations_json_is_indexed_by_position() -> None:
    entries = json.loads(stations_json(make_build().stations))

    assert entries == [
        {"didok": 8_507_000, "name": "Bern"},
        {"didok": 8_501_120, "name": "Lausanne"},
    ]


def test_write_day_artifacts_writes_blob_and_stations(tmp_path: Path) -> None:
    write_day_artifacts(make_build(), tmp_path)

    blob = (tmp_path / "schedule.itsb").read_bytes()
    assert read_header(blob).station_count == 2
    stations = json.loads((tmp_path / "stations.json").read_text())
    assert [entry["name"] for entry in stations] == ["Bern", "Lausanne"]


def test_write_day_artifacts_creates_missing_dest(tmp_path: Path) -> None:
    dest = tmp_path / "2026-07-16"
    write_day_artifacts(make_build(), dest)

    assert (dest / "schedule.itsb").exists()
    assert (dest / "stations.json").exists()


def test_locate_gdb_finds_the_only_geodatabase(tmp_path: Path) -> None:
    (tmp_path / "schienennetz_2056_de.gdb").mkdir()
    (tmp_path / "readme.txt").write_text("ignored")

    assert locate_gdb(tmp_path) == tmp_path / "schienennetz_2056_de.gdb"


def test_locate_gdb_rejects_when_none(tmp_path: Path) -> None:
    with pytest.raises(ValueError, match="no .gdb"):
        locate_gdb(tmp_path)


def test_locate_gdb_rejects_when_ambiguous(tmp_path: Path) -> None:
    (tmp_path / "a.gdb").mkdir()
    (tmp_path / "b.gdb").mkdir()

    with pytest.raises(ValueError, match="multiple .gdb"):
        locate_gdb(tmp_path)


def test_reload_runner_is_a_noop_for_an_empty_command() -> None:
    reload_runner([])()


def test_reload_runner_invokes_a_configured_command() -> None:
    calls: list[list[str]] = []
    reload_runner(["true"], runner=calls.append)()

    assert calls == [["true"]]
