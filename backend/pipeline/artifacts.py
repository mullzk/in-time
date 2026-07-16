"""Turns an assembled schedule day into the files published under a day's
artifact directory, and provides the small glue the build command wires
together (source version string, geodatabase lookup, service reload)."""

import json
import subprocess
from collections.abc import Callable
from pathlib import Path

from pipeline.schedule_blob import write_schedule_blob
from pipeline.schedule_day import ScheduleBuild, StationEntry

SCHEDULE_BLOB_NAME = "schedule.itsb"
STATIONS_NAME = "stations.json"


def composite_version(gtfs_version: str, rail_network_version: str) -> str:
    return f"gtfs={gtfs_version};railnet={rail_network_version}"


def stations_json(stations: list[StationEntry]) -> str:
    return json.dumps(
        [{"didok": station.didok, "name": station.name} for station in stations],
        ensure_ascii=False,
    )


def write_day_artifacts(build: ScheduleBuild, dest: Path) -> None:
    dest.mkdir(parents=True, exist_ok=True)
    (dest / SCHEDULE_BLOB_NAME).write_bytes(write_schedule_blob(build.day))
    (dest / STATIONS_NAME).write_text(stations_json(build.stations))


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
