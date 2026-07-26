import gzip
import json
from datetime import date
from pathlib import Path

import brotli
import pytest

from pipeline.artifacts import (
    composite_version,
    locate_gdb,
    reload_runner,
    stations_json,
    write_day_artifacts,
)
from pipeline.schedule_blob import NetworkType, ScheduleDay, read_header
from pipeline.schedule_day import DayBuilds, ScheduleBuild, StationEntry


def make_build(stations: list[StationEntry]) -> ScheduleBuild:
    day = ScheduleDay(
        service_date=date(2026, 7, 16),
        stations=[(2_600_000.0, 1_200_000.0)] * len(stations),
        edges=[],
        trips=[],
    )
    return ScheduleBuild(day, stations, method_counts={}, straight_fallbacks=[])


def make_builds() -> DayBuilds:
    rail = make_build(
        [
            StationEntry(8_507_000, "Bern", {"rail"}),
            StationEntry(8_501_120, "Lausanne", {"tram", "rail"}),
        ]
    )
    road = make_build([StationEntry(8_500_100, "Basel, Bahnhof", {"bus"})])
    return DayBuilds(rail=rail, road=road)


def test_composite_version_joins_both_sources() -> None:
    assert composite_version("20260715", "20260716") == (
        "gtfs=20260715;railnet=20260716"
    )


def test_stations_json_is_indexed_by_position_with_ordered_modes() -> None:
    entries = json.loads(stations_json(make_builds().rail.stations, {}))

    # Modes are emitted in the canonical rail, tram, bus order regardless of the
    # set's iteration order.
    assert entries == [
        {"didok": 8_507_000, "name": "Bern", "modes": ["rail"]},
        {"didok": 8_501_120, "name": "Lausanne", "modes": ["rail", "tram"]},
    ]


def test_stations_json_carries_the_cluster_of_a_clustered_station() -> None:
    # A cluster spans blobs: the rail Bern and the road stop share a cluster id;
    # an unclustered station omits the field.
    clusters = {8_507_000: 8_507_000, 8_500_100: 8_507_000}
    rail = json.loads(stations_json(make_builds().rail.stations, clusters))
    road = json.loads(stations_json(make_builds().road.stations, clusters))
    assert rail[0]["cluster"] == 8_507_000
    assert "cluster" not in rail[1]
    assert road[0]["cluster"] == 8_507_000


def test_write_day_artifacts_writes_both_blobs_and_stations(tmp_path: Path) -> None:
    write_day_artifacts(make_builds(), tmp_path, {})

    rail = read_header((tmp_path / "schedule-rail.itsb").read_bytes())
    road = read_header((tmp_path / "schedule-road.itsb").read_bytes())
    assert rail.station_count == 2
    assert road.station_count == 1
    # The rail blob is tagged rail; the road blob bus.
    assert rail.network_type == NetworkType.RAIL
    assert road.network_type == NetworkType.BUS

    rail_stations = json.loads((tmp_path / "stations-rail.json").read_text())
    road_stations = json.loads((tmp_path / "stations-road.json").read_text())
    assert [entry["name"] for entry in rail_stations] == ["Bern", "Lausanne"]
    assert [entry["name"] for entry in road_stations] == ["Basel, Bahnhof"]


def test_write_day_artifacts_creates_missing_dest(tmp_path: Path) -> None:
    dest = tmp_path / "2026-07-16"
    write_day_artifacts(make_builds(), dest, {})

    assert (dest / "schedule-rail.itsb").exists()
    assert (dest / "schedule-road.itsb").exists()
    assert (dest / "stations-rail.json").exists()
    assert (dest / "stations-road.json").exists()


@pytest.mark.parametrize(
    "name",
    [
        "schedule-rail.itsb",
        "schedule-road.itsb",
        "stations-rail.json",
        "stations-road.json",
    ],
)
def test_write_day_artifacts_emits_matching_sidecars(tmp_path: Path, name: str) -> None:
    write_day_artifacts(make_builds(), tmp_path, {})

    raw = (tmp_path / name).read_bytes()
    assert gzip.decompress((tmp_path / f"{name}.gz").read_bytes()) == raw
    assert brotli.decompress((tmp_path / f"{name}.br").read_bytes()) == raw


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
