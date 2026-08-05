"""Builds the bus-stop catalog from GTFS stops.txt: one LV95 station point and
name per Swiss DiDok.

Bus anchors are plain stop coordinates, whereas rail and tram take theirs from
the BAV network node. GTFS carries stops in WGS84 keyed by SLOID, with the DiDok
number in the didok column and one row per platform. We collapse the platforms onto
their station, reproject to LV95 and drop foreign stops, which lie outside the
area the map covers."""

import csv
from dataclasses import dataclass
from pathlib import Path

from pyproj import Transformer

from pipeline.gtfs import is_swiss_didok_text
from pipeline.network import Point

STATION_LOCATION_TYPE = "1"

_WGS84_TO_LV95 = Transformer.from_crs("EPSG:4326", "EPSG:2056", always_xy=True)


@dataclass(frozen=True)
class BusStop:
    didok: int
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
    didoks = list(raw)
    longitudes = [raw[didok][0] for didok in didoks]
    latitudes = [raw[didok][1] for didok in didoks]
    easts, norths = _WGS84_TO_LV95.transform(longitudes, latitudes)
    return {
        didok: BusStop(didok, (float(east), float(north)), raw[didok][2])
        for didok, east, north in zip(didoks, easts, norths, strict=True)
    }


def load_bus_stops(gtfs_dir: Path) -> dict[int, BusStop]:
    best_rank: dict[int, int] = {}
    raw: dict[int, tuple[float, float, str]] = {}
    with open(gtfs_dir / "stops.txt", encoding="utf-8-sig", newline="") as feed:
        for row in csv.DictReader(feed):
            didok_text = (row.get("didok") or "").strip()
            if not is_swiss_didok_text(didok_text):
                continue
            try:
                latitude = float(row["stop_lat"])
                longitude = float(row["stop_lon"])
            except ValueError:
                continue
            didok = int(didok_text)
            rank = _station_rank(
                row.get("location_type", ""), row.get("platform_code", "")
            )
            if didok in best_rank and best_rank[didok] <= rank:
                continue
            best_rank[didok] = rank
            raw[didok] = (longitude, latitude, row["stop_name"])
    return _reproject(raw)
