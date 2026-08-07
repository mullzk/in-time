"""The daily build: fetch the sources, assemble one service day, publish it.

Every step below is owned by its own module; this command only puts them in
order. The overview exists because most of what a build does is reached
indirectly from here.

**Sources.** The GTFS feed and the BAV rail network are versioned archives.
The current version of each is resolved without downloading it, and a version
already on disk is reused. Both versions together tag the run, which is
recorded in a permanent ledger — a day already published from the same two
versions is skipped instead of rebuilt. A finished build prunes the archives
it superseded.

**Inputs.** The rail network becomes a graph of nodes and track geometry in
LV95, knowing which station number sits on which node. The GTFS stops become
one point per Swiss station, platform rows collapsed onto the station they
belong to and foreign stops dropped. The transfer table becomes interchange
clusters, so a railway station and the tram and bus stops around it — separate
station numbers at one place — are known to be one place. Independently, a
scan across the whole feed year decides which station-to-station connections
run often and regularly enough to belong on a base map; it is cached per feed
version, since it depends on nothing else.

**The day.** The calendar decides which trips run, and the timetable gives
each of them its ordered calls. The trips split into the two published
networks, railbound (rail and tram) and road (bus). Trips then fall away: for
connections the frequency scan rejected, and for calls at stations that cannot
be placed on the map — and whatever is left holding fewer than two calls goes
with them.

**Placing the trips.** A railbound station is anchored on its network node
rather than on its timetable coordinate, and its legs are routed over the
track network: between the two stations' own nodes where that works, from
nodes nearby where it does not, out of legs already routed where that fails
too, and as a straight line when the network cannot join the two at all. The
track geometry is simplified and held once, so a leg is only a reference into
it. Bus legs carry no geometry at all; the client draws them straight.

**Output.** Each network becomes a binary schedule blob and a station catalog,
both written alongside pre-compressed copies. Publishing swaps a symlink to
the new day and drops the day it replaced, after which an optional command
tells the serving side to pick it up. With --diagnose the run also reports how
much of the routing succeeded and where it gave up.
"""

import datetime
import subprocess
import time
from collections.abc import Callable
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand, CommandParser
from django.utils import timezone

from pipeline import fetch
from pipeline.artifacts import (
    SCHEDULE_RAIL_BLOB_NAME,
    SCHEDULE_ROAD_BLOB_NAME,
    composite_version,
    write_day_artifacts,
)
from pipeline.bus_stops import load_bus_stops
from pipeline.datadir import DataDir
from pipeline.diagnostics import DayDiagnostics
from pipeline.frequency import (
    REGULAR_CONNECTIONS_CACHE_NAME,
    load_or_scan_regular_connections,
)
from pipeline.network.rail_gdb import load_rail_graph
from pipeline.schedule_day import build_schedule_day
from pipeline.schedule_run import run_schedule_build
from pipeline.station_clusters import load_station_clusters


def reload_runner(
    command: list[str],
    runner: Callable[[list[str]], object] = lambda cmd: subprocess.run(cmd, check=True),
) -> Callable[[], None]:
    def reload() -> None:
        if command:
            runner(command)

    return reload


class Command(BaseCommand):
    help = "Fetch the current sources and build and publish one service day."

    def add_arguments(self, parser: CommandParser) -> None:
        parser.add_argument(
            "--date", default=None, help="service day YYYY-MM-DD (default: today)"
        )
        parser.add_argument(
            "--diagnose",
            action="store_true",
            help="print a routing-quality report for the built day",
        )

    def handle(self, *args: object, **options: object) -> None:
        raw_date = options["date"]
        service_date = (
            datetime.date.fromisoformat(str(raw_date))
            if raw_date is not None
            else timezone.localdate()
        )

        data_dir = DataDir(settings.DATA_DIR)
        gtfs_archive = fetch.gtfs_archive(data_dir.gtfs_archive_root)
        rail_network_archive = fetch.rail_network_archive(
            data_dir.rail_network_archive_root
        )
        versions: dict[str, str] = {}
        diagnostics: list[DayDiagnostics] = []

        def fetch_sources() -> str:
            versions["gtfs"] = gtfs_archive.ensure_current_version()
            versions["rail"] = rail_network_archive.ensure_current_version()
            return composite_version(versions["gtfs"], versions["rail"])

        def build_day_artifacts(day: datetime.date, dest: Path) -> None:
            gdb = fetch.locate_gdb(rail_network_archive.path_for(versions["rail"]))
            started = time.monotonic()
            rail_graph = load_rail_graph(gdb)
            gtfs_dir = gtfs_archive.path_for(versions["gtfs"])
            bus_stops = load_bus_stops(gtfs_dir)
            station_clusters = load_station_clusters(gtfs_dir)
            regular_connections = load_or_scan_regular_connections(
                gtfs_dir, gtfs_dir / REGULAR_CONNECTIONS_CACHE_NAME
            )
            inputs_seconds = time.monotonic() - started

            started = time.monotonic()
            builds = build_schedule_day(
                gtfs_dir, rail_graph, bus_stops, regular_connections, day
            )
            build_seconds = time.monotonic() - started

            write_day_artifacts(builds, dest, station_clusters)
            if options["diagnose"]:
                diagnostics.append(
                    DayDiagnostics(
                        service_date=day,
                        builds=builds,
                        inputs_seconds=inputs_seconds,
                        build_seconds=build_seconds,
                        rail_blob_bytes=(dest / SCHEDULE_RAIL_BLOB_NAME).stat().st_size,
                        road_blob_bytes=(dest / SCHEDULE_ROAD_BLOB_NAME).stat().st_size,
                    )
                )

        run = run_schedule_build(
            data_dir,
            service_date,
            fetch_sources=fetch_sources,
            build_day_artifacts=build_day_artifacts,
            reload_service=reload_runner(settings.SCHEDULE_RELOAD_COMMAND),
        )

        gtfs_archive.retain_only(versions["gtfs"])
        rail_network_archive.retain_only(versions["rail"])
        self.stdout.write(f"{service_date}: {run.status} ({run.source_version})")
        for report in diagnostics:
            for line in report.lines():
                self.stdout.write(line)
