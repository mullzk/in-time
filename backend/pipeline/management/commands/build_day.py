import datetime
import time
from pathlib import Path

from django.core.management.base import BaseCommand, CommandParser

from pipeline.network.rail_gdb import load_rail_graph
from pipeline.schedule_blob import read_schedule_blob, write_schedule_blob
from pipeline.schedule_day import ScheduleBuild, build_schedule_day


class Command(BaseCommand):
    help = "Build one service day's schedule blob from a real GDB and GTFS feed."

    def add_arguments(self, parser: CommandParser) -> None:
        parser.add_argument("--gdb", required=True)
        parser.add_argument("--gtfs", required=True)
        parser.add_argument("--date", required=True, help="YYYY-MM-DD")
        parser.add_argument("--out", required=True, help="path for schedule.itsb")
        parser.add_argument("--docs", default=None, help="dir for the fallback list")

    def handle(self, *args: object, **options: object) -> None:
        gdb = Path(str(options["gdb"]))
        gtfs = Path(str(options["gtfs"]))
        service_date = datetime.date.fromisoformat(str(options["date"]))
        out = Path(str(options["out"]))

        started = time.monotonic()
        rail_graph = load_rail_graph(gdb)
        graph_seconds = time.monotonic() - started

        started = time.monotonic()
        build = build_schedule_day(gtfs, rail_graph, service_date)
        build_seconds = time.monotonic() - started

        blob = write_schedule_blob(build.day)
        out.write_bytes(blob)
        restored = read_schedule_blob(blob)
        round_trip_ok = len(restored.trips) == len(build.day.trips) and len(
            restored.stations
        ) == len(build.day.stations)

        total_legs = sum(build.method_counts.values())
        self.stdout.write(f"date:               {service_date}")
        self.stdout.write(f"trips:              {len(build.day.trips)}")
        self.stdout.write(f"stations:           {len(build.day.stations)}")
        self.stdout.write(f"edges:              {len(build.day.edges)}")
        self.stdout.write(f"blob size:          {len(blob) / 1e6:.2f} MB")
        self.stdout.write(f"round-trip ok:      {round_trip_ok}")
        self.stdout.write(f"graph load:         {graph_seconds:.1f}s")
        self.stdout.write(f"day build:          {build_seconds:.1f}s")
        for method in ("direct", "multi_snap", "recover", "straight"):
            count = build.method_counts.get(method, 0)
            share = 100 * count / total_legs if total_legs else 0.0
            self.stdout.write(f"  {method:<11} {count:>7} ({share:.2f}%)")

        if options["docs"] is not None:
            self._write_fallback_list(Path(str(options["docs"])), service_date, build)

    def _write_fallback_list(
        self, docs_dir: Path, service_date: datetime.date, build: ScheduleBuild
    ) -> None:
        fallbacks = build.straight_fallbacks
        lines = [
            "# Straight-line fallback legs",
            "",
            f"Legs that could not be routed on real track for {service_date} and "
            "were drawn as a straight line. Sorted by distance.",
            "",
            "| start | end | distance (km) |",
            "| ----- | --- | ------------- |",
        ]
        lines.extend(
            f"| {leg.from_name} | {leg.to_name} | {leg.distance_km:.1f} |"
            for leg in fallbacks
        )
        lines.append("")
        (docs_dir / "straight-line-fallbacks.md").write_text("\n".join(lines))
