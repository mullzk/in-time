import csv
import datetime
from dataclasses import dataclass
from pathlib import Path

# GTFS schedule reading for the rail schedule blob. Ported from the prototype's
# build_tag.py, replacing its positional column parsing with header-named access.

RAIL_ROUTE_TYPES = frozenset({100, 101, 102, 103, 105, 106, 107, 109, 116, 117})

# route_type -> product category (0 Fernverkehr, 1 IR, 2 Regio, 3 S-Bahn,
# 4 übrige). Rail types without an explicit mapping fall into category 4.
_CATEGORY = {101: 0, 102: 0, 103: 1, 106: 2, 100: 2, 107: 2, 109: 3, 105: 4}

_WEEKDAY_COLUMNS = [
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday",
]


@dataclass
class StopCall:
    didok: int
    arr: int
    dep: int


def category_of(route_type: int) -> int | None:
    if route_type not in RAIL_ROUTE_TYPES:
        return None
    return _CATEGORY.get(route_type, 4)


def seconds_since_midnight(clock: str) -> int:
    hours, minutes, seconds = (int(part) for part in clock.split(":"))
    return hours * 3600 + minutes * 60 + seconds


def active_services(gtfs_dir: Path, service_date: datetime.date) -> set[str]:
    weekday_column = _WEEKDAY_COLUMNS[service_date.weekday()]
    date_str = service_date.strftime("%Y%m%d")

    regular: set[str] = set()
    with open(gtfs_dir / "calendar.txt", encoding="utf-8-sig", newline="") as feed:
        for row in csv.DictReader(feed):
            if row[weekday_column] == "1" and (
                row["start_date"] <= date_str <= row["end_date"]
            ):
                regular.add(row["service_id"])

    added: set[str] = set()
    removed: set[str] = set()
    exceptions = gtfs_dir / "calendar_dates.txt"
    if exceptions.exists():
        with open(exceptions, encoding="utf-8-sig", newline="") as feed:
            for row in csv.DictReader(feed):
                if row["date"] != date_str:
                    continue
                (added if row["exception_type"] == "1" else removed).add(
                    row["service_id"]
                )
    return (regular | added) - removed


def rail_routes(gtfs_dir: Path) -> dict[str, int]:
    routes: dict[str, int] = {}
    with open(gtfs_dir / "routes.txt", encoding="utf-8-sig", newline="") as feed:
        for row in csv.DictReader(feed):
            category = category_of(int(row["route_type"]))
            if category is not None:
                routes[row["route_id"]] = category
    return routes


def active_rail_trips(gtfs_dir: Path, service_date: datetime.date) -> dict[str, int]:
    services = active_services(gtfs_dir, service_date)
    routes = rail_routes(gtfs_dir)
    trips: dict[str, int] = {}
    with open(gtfs_dir / "trips.txt", encoding="utf-8-sig", newline="") as feed:
        for row in csv.DictReader(feed):
            if row["route_id"] in routes and row["service_id"] in services:
                trips[row["trip_id"]] = routes[row["route_id"]]
    return trips


def _stop_didok_map(gtfs_dir: Path) -> dict[str, int]:
    mapping: dict[str, int] = {}
    with open(gtfs_dir / "stops.txt", encoding="utf-8-sig", newline="") as feed:
        reader = csv.DictReader(feed)
        if "didok" not in (reader.fieldnames or ()):
            return mapping
        for row in reader:
            value = (row["didok"] or "").strip()
            if value.isdigit():
                mapping[row["stop_id"]] = int(value)
    return mapping


def _resolve_didok(stop_id: str, didok_map: dict[str, int]) -> int | None:
    head = stop_id.split(":")[0]
    if head.isdigit():
        return int(head)
    return didok_map.get(stop_id)


def stop_sequences(gtfs_dir: Path, trip_ids: set[str]) -> dict[str, list[StopCall]]:
    didok_map = _stop_didok_map(gtfs_dir)
    ordered: dict[str, list[tuple[int, StopCall]]] = {trip: [] for trip in trip_ids}

    with open(gtfs_dir / "stop_times.txt", encoding="utf-8-sig", newline="") as feed:
        reader = csv.reader(feed)
        header = next(reader)
        column = {name: index for index, name in enumerate(header)}
        trip_at = column["trip_id"]
        arr_at = column["arrival_time"]
        dep_at = column["departure_time"]
        stop_at = column["stop_id"]
        sequence_at = column["stop_sequence"]
        for row in reader:
            trip = row[trip_at]
            if trip not in ordered:
                continue
            didok = _resolve_didok(row[stop_at], didok_map)
            if didok is None:
                continue
            call = StopCall(
                didok=didok,
                arr=seconds_since_midnight(row[arr_at]),
                dep=seconds_since_midnight(row[dep_at]),
            )
            ordered[trip].append((int(row[sequence_at]), call))

    return {
        trip: [call for _, call in sorted(calls, key=lambda item: item[0])]
        for trip, calls in ordered.items()
    }
