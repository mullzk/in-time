import datetime
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand, CommandParser
from django.utils import timezone

from pipeline.artifacts import (
    composite_version,
    locate_gdb,
    reload_runner,
    write_day_artifacts,
)
from pipeline.bus_stops import load_bus_stops
from pipeline.datadir import DataDir
from pipeline.fetch import gtfs_archive, rail_network_archive
from pipeline.frequency import REGULAR_EDGES_CACHE_NAME, load_or_scan_regular_edges
from pipeline.network.rail_gdb import load_rail_graph
from pipeline.schedule import run_build_schedule
from pipeline.schedule_day import build_day_builds


class Command(BaseCommand):
    help = "Fetch the current sources and build and publish one service day."

    def add_arguments(self, parser: CommandParser) -> None:
        parser.add_argument(
            "--date", default=None, help="service day YYYY-MM-DD (default: today)"
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

        def fetch_sources() -> str:
            versions["gtfs"] = gtfs.ensure()
            versions["rail"] = rail_network.ensure()
            return composite_version(versions["gtfs"], versions["rail"])

        def build_day(day: datetime.date, dest: Path) -> None:
            gdb = locate_gdb(rail_network.path_for(versions["rail"]))
            rail_graph = load_rail_graph(gdb)
            gtfs_dir = gtfs.path_for(versions["gtfs"])
            bus_stops = load_bus_stops(gtfs_dir)
            regular_edges = load_or_scan_regular_edges(
                gtfs_dir, gtfs_dir / REGULAR_EDGES_CACHE_NAME
            )
            builds = build_day_builds(
                gtfs_dir, rail_graph, bus_stops, regular_edges, day
            )
            write_day_artifacts(builds, dest)

        run = run_build_schedule(
            data_dir,
            service_date,
            fetch_gtfs=fetch_sources,
            build_day=build_day,
            reload_service=reload_runner(settings.SCHEDULE_RELOAD_COMMAND),
        )

        gtfs.retain_only(versions["gtfs"])
        rail_network.retain_only(versions["rail"])
        self.stdout.write(f"{service_date}: {run.status} ({run.source_version})")
