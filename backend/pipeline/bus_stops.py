"""Builds the bus-stop catalog from GTFS stops.txt: one LV95 station point and
name per Swiss BPUIC.

Bus anchors are plain stop coordinates, whereas rail and tram take theirs from
the BAV network node. GTFS carries stops in WGS84 keyed by SLOID, with the BPUIC
in the didok column and one row per platform. We collapse the platforms onto
their station, reproject to LV95 and drop foreign stops, which lie outside the
swissTLM3D road network and cannot be routed."""

import csv
from dataclasses import dataclass
from pathlib import Path

from pyproj import Transformer

from pipeline.gtfs import is_swiss_bpuic_text
from pipeline.network import Point

STATION_LOCATION_TYPE = "1"

_WGS84_TO_LV95 = Transformer.from_crs("EPSG:4326", "EPSG:2056", always_xy=True)


@dataclass(frozen=True)
class BusStop:
    bpuic: int
    location: Point
    name: str


def _station_rank(location_type: str, platform_code: str) -> int:
    if location_type == STATION_LOCATION_TYPE:
        return 0
    if not platform_code.strip():
        return 1
    return 2


def _reproject(raw: dict[int, tuple[float, float, str]]) -> dict[int, BusStop]:
    if not raw:
        return {}
    bpuics = list(raw)
    longitudes = [raw[bpuic][0] for bpuic in bpuics]
    latitudes = [raw[bpuic][1] for bpuic in bpuics]
    easts, norths = _WGS84_TO_LV95.transform(longitudes, latitudes)
    return {
        bpuic: BusStop(bpuic, (float(east), float(north)), raw[bpuic][2])
        for bpuic, east, north in zip(bpuics, easts, norths, strict=True)
    }


def load_bus_stops(gtfs_dir: Path) -> dict[int, BusStop]:
    best_rank: dict[int, int] = {}
    raw: dict[int, tuple[float, float, str]] = {}
    with open(gtfs_dir / "stops.txt", encoding="utf-8-sig", newline="") as feed:
        for row in csv.DictReader(feed):
            bpuic_text = (row.get("didok") or "").strip()
            if not is_swiss_bpuic_text(bpuic_text):
                continue
            try:
                latitude = float(row["stop_lat"])
                longitude = float(row["stop_lon"])
            except ValueError:
                continue
            bpuic = int(bpuic_text)
            rank = _station_rank(
                row.get("location_type", ""), row.get("platform_code", "")
            )
            if bpuic in best_rank and best_rank[bpuic] <= rank:
                continue
            best_rank[bpuic] = rank
            raw[bpuic] = (longitude, latitude, row["stop_name"])
    return _reproject(raw)
