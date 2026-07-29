"""Turns an assembled schedule day into the files published under a day's
artifact directory, plus the composite source-version string that tags a
build."""

import gzip
import json
from pathlib import Path

import brotli

from pipeline.atomicio import write_atomically
from pipeline.schedule_blob import NetworkType, create_schedule_blob
from pipeline.schedule_day import (
    DayBuilds,
    ScheduleBuild,
    StationEntry,
    ordered_station_modes,
)

SCHEDULE_RAIL_BLOB_NAME = "schedule-rail.itsb"
SCHEDULE_ROAD_BLOB_NAME = "schedule-road.itsb"
STATIONS_RAIL_NAME = "stations-rail.json"
STATIONS_ROAD_NAME = "stations-road.json"


def composite_version(gtfs_version: str, rail_network_version: str) -> str:
    return f"gtfs={gtfs_version};railnet={rail_network_version}"


def _station_json(station: StationEntry, clusters: dict[int, int]) -> dict[str, object]:
    entry: dict[str, object] = {
        "didok": station.didok,
        "name": station.name,
        "modes": ordered_station_modes(station.modes),
    }
    cluster = clusters.get(station.didok)
    if cluster is not None:
        entry["cluster"] = cluster
    return entry


def stations_json(stations: list[StationEntry], clusters: dict[int, int]) -> str:
    return json.dumps(
        [_station_json(station, clusters) for station in stations],
        ensure_ascii=False,
    )


def write_day_artifacts(
    builds: DayBuilds, dest: Path, clusters: dict[int, int]
) -> None:
    dest.mkdir(parents=True, exist_ok=True)
    _write_build(
        dest,
        builds.rail,
        SCHEDULE_RAIL_BLOB_NAME,
        STATIONS_RAIL_NAME,
        NetworkType.RAIL,
        clusters,
    )
    _write_build(
        dest,
        builds.road,
        SCHEDULE_ROAD_BLOB_NAME,
        STATIONS_ROAD_NAME,
        NetworkType.ROAD,
        clusters,
    )


def _write_build(
    dest: Path,
    build: ScheduleBuild,
    blob_name: str,
    stations_name: str,
    network_type: NetworkType,
    clusters: dict[int, int],
) -> None:
    _write_with_sidecars(
        dest / blob_name, create_schedule_blob(build.day, network_type)
    )
    _write_with_sidecars(
        dest / stations_name,
        stations_json(build.stations, clusters).encode("utf-8"),
    )


def _write_with_sidecars(path: Path, data: bytes) -> None:
    write_atomically(path, data)
    write_atomically(path.with_name(path.name + ".gz"), gzip.compress(data, 9))
    write_atomically(
        path.with_name(path.name + ".br"), brotli.compress(data, quality=11)
    )
