"""Formats a routing-quality report for one built service day: how each rail or
tram leg was placed on the BAV network, and which legs fell back to a straight
line drawn between their stations."""

from dataclasses import dataclass
from datetime import date

from pipeline.schedule_day import DayBuilds

_ROUTING_METHODS = ("direct", "multi_snap", "recover", "straight")


@dataclass
class DayDiagnostics:
    service_date: date
    builds: DayBuilds
    inputs_seconds: float
    build_seconds: float
    bav_blob_bytes: int
    road_blob_bytes: int

    def lines(self) -> list[str]:
        bav = self.builds.bav
        road = self.builds.road
        report = [
            f"date:               {self.service_date}",
            f"bav trips:          {len(bav.day.trips)}",
            f"road trips:         {len(road.day.trips)}",
            f"bav stations:       {len(bav.day.stations)}",
            f"road stations:      {len(road.day.stations)}",
            f"bav edges:          {len(bav.day.edges)}",
            f"bav blob size:      {self.bav_blob_bytes / 1e6:.2f} MB",
            f"road blob size:     {self.road_blob_bytes / 1e6:.2f} MB",
            f"inputs load:        {self.inputs_seconds:.1f}s",
            f"day build:          {self.build_seconds:.1f}s",
        ]
        report.extend(self._routing_method_lines())
        report.extend(self._straight_fallback_lines())
        return report

    def _routing_method_lines(self) -> list[str]:
        counts = self.builds.bav.method_counts
        total = sum(counts.values())
        lines = ["routing methods (bav):"]
        lines.extend(
            f"  {method:<11} {counts.get(method, 0):>7} "
            f"({100 * counts.get(method, 0) / total if total else 0.0:.2f}%)"
            for method in _ROUTING_METHODS
        )
        return lines

    def _straight_fallback_lines(self) -> list[str]:
        fallbacks = self.builds.bav.straight_fallbacks
        lines = [f"straight-line fallbacks: {len(fallbacks)} (by distance)"]
        lines.extend(
            f"  {fallback.from_name} -> {fallback.to_name} "
            f" {fallback.distance_km:.1f} km"
            for fallback in fallbacks
        )
        return lines
