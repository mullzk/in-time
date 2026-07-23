"""Turns an assembled schedule day into the files published under a day's
artifact directory, and provides the small glue the build command wires
together (source version string, geodatabase lookup, service reload)."""

import gzip
import json
import subprocess
from collections.abc import Callable
from pathlib import Path

import brotli

from pipeline.schedule_blob import FLAG_BAV_ONLY, write_schedule_blob
from pipeline.schedule_day import DayBuilds, ScheduleBuild, StationEntry

SCHEDULE_BLOB_NAME = "schedule.itsb"
SCHEDULE_ROAD_BLOB_NAME = "schedule-road.itsb"
STATIONS_NAME = "stations.json"
STATIONS_ROAD_NAME = "stations-road.json"


def composite_version(gtfs_version: str, rail_network_version: str) -> str:
    return f"gtfs={gtfs_version};railnet={rail_network_version}"


def stations_json(stations: list[StationEntry]) -> str:
    return json.dumps(
        [{"didok": station.didok, "name": station.name} for station in stations],
        ensure_ascii=False,
    )


def write_day_artifacts(builds: DayBuilds, dest: Path) -> None:
    dest.mkdir(parents=True, exist_ok=True)
    _write_build(dest, builds.bav, SCHEDULE_BLOB_NAME, STATIONS_NAME, FLAG_BAV_ONLY)
    _write_build(dest, builds.road, SCHEDULE_ROAD_BLOB_NAME, STATIONS_ROAD_NAME, 0)


def _write_build(
    dest: Path, build: ScheduleBuild, blob_name: str, stations_name: str, flags: int
) -> None:
    _write_with_sidecars(dest / blob_name, write_schedule_blob(build.day, flags))
    _write_with_sidecars(
        dest / stations_name, stations_json(build.stations).encode("utf-8")
    )


def _write_with_sidecars(path: Path, data: bytes) -> None:
    path.write_bytes(data)
    path.with_name(path.name + ".gz").write_bytes(gzip.compress(data, 9))
    path.with_name(path.name + ".br").write_bytes(brotli.compress(data, quality=11))


def locate_gdb(archive_dir: Path) -> Path:
    geodatabases = sorted(archive_dir.glob("*.gdb"))
    if not geodatabases:
        raise ValueError(f"no .gdb in {archive_dir}")
    if len(geodatabases) > 1:
        raise ValueError(f"multiple .gdb in {archive_dir}")
    return geodatabases[0]


def reload_runner(
    command: list[str],
    runner: Callable[[list[str]], object] = lambda cmd: subprocess.run(cmd, check=True),
) -> Callable[[], None]:
    def reload() -> None:
        if command:
            runner(command)

    return reload
