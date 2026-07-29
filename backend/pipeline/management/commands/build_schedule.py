import datetime
import time
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand, CommandParser
from django.utils import timezone

from pipeline.artifacts import (
    SCHEDULE_RAIL_BLOB_NAME,
    SCHEDULE_ROAD_BLOB_NAME,
    composite_version,
    locate_gdb,
    reload_runner,
    write_day_artifacts,
)
from pipeline.bus_stops import load_bus_stops
from pipeline.datadir import DataDir
from pipeline.diagnostics import DayDiagnostics
from pipeline.fetch import gtfs_archive, rail_network_archive
from pipeline.frequency import REGULAR_EDGES_CACHE_NAME, load_or_scan_regular_edges
from pipeline.network.rail_gdb import load_rail_graph
from pipeline.schedule_day import build_schedule_day
from pipeline.schedule_run import run_schedule_build
from pipeline.station_clusters import load_station_clusters


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
        gtfs = gtfs_archive(data_dir.gtfs_archive)
        rail_network = rail_network_archive(data_dir.rail_network_archive)
        versions: dict[str, str] = {}
        diagnostics: list[DayDiagnostics] = []

        def fetch_sources() -> str:
            versions["gtfs"] = gtfs.ensure()
            versions["rail"] = rail_network.ensure()
            return composite_version(versions["gtfs"], versions["rail"])

        def build_day_artifacts(day: datetime.date, dest: Path) -> None:
            gdb = locate_gdb(rail_network.path_for(versions["rail"]))
            started = time.monotonic()
            rail_graph = load_rail_graph(gdb)
            gtfs_dir = gtfs.path_for(versions["gtfs"])
            bus_stops = load_bus_stops(gtfs_dir)
            station_clusters = load_station_clusters(gtfs_dir)
            regular_edges = load_or_scan_regular_edges(
                gtfs_dir, gtfs_dir / REGULAR_EDGES_CACHE_NAME
            )
            inputs_seconds = time.monotonic() - started

            started = time.monotonic()
            builds = build_schedule_day(
                gtfs_dir, rail_graph, bus_stops, regular_edges, day
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

        gtfs.retain_only(versions["gtfs"])
        rail_network.retain_only(versions["rail"])
        self.stdout.write(f"{service_date}: {run.status} ({run.source_version})")
        for report in diagnostics:
            for line in report.lines():
                self.stdout.write(line)
