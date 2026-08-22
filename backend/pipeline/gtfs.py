"""GTFS schedule reading: active services, categorised trips, and per-trip stop
sequences for a service date."""

import csv
import datetime
from dataclasses import dataclass
from pathlib import Path

RAIL_ROUTE_TYPES = frozenset({100, 101, 102, 103, 105, 106, 107, 109, 116, 117})
TRAM_ROUTE_TYPE = 900
# The Lausanne metro runs on the BAV network and is drawn and sounded as a tram.
METRO_ROUTE_TYPE = 401
BUS_ROUTE_TYPES = frozenset({700, 702})

CATEGORY_TRAM = 5
CATEGORY_BUS = 6
RAIL_CATEGORIES = frozenset({0, 1, 2, 3, 4})

SWISS_DIDOK_PREFIX = "85"


def is_swiss_didok(didok: int) -> bool:
    return str(didok).startswith(SWISS_DIDOK_PREFIX)


def is_swiss_didok_text(didok_text: str) -> bool:
    return didok_text.isdigit() and didok_text.startswith(SWISS_DIDOK_PREFIX)


# route_type -> product category (0 Fernverkehr, 1 IR, 2 Regio, 3 S-Bahn,
# 4 übrige). Rail types without an explicit mapping fall into category 4.
_CATEGORY = {101: 0, 102: 0, 103: 1, 106: 2, 100: 2, 107: 2, 109: 3, 105: 4}

WEEKDAY_COLUMNS = [
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
    arrival: int
    departure: int


def category_of(route_type: int) -> int | None:
    if route_type in RAIL_ROUTE_TYPES:
        return _CATEGORY.get(route_type, 4)
    if route_type in (TRAM_ROUTE_TYPE, METRO_ROUTE_TYPE):
        return CATEGORY_TRAM
    if route_type in BUS_ROUTE_TYPES:
        return CATEGORY_BUS
    return None


def seconds_since_midnight(clock: str) -> int:
    hours, minutes, seconds = (int(part) for part in clock.split(":"))
    return hours * 3600 + minutes * 60 + seconds


def _services_by_calendar(gtfs_dir: Path, service_date: datetime.date) -> set[str]:
    weekday_column = WEEKDAY_COLUMNS[service_date.weekday()]
    date_text = service_date.strftime("%Y%m%d")
    with open(gtfs_dir / "calendar.txt", encoding="utf-8-sig", newline="") as feed:
        return {
            row["service_id"]
            for row in csv.DictReader(feed)
            if row[weekday_column] == "1"
            and row["start_date"] <= date_text <= row["end_date"]
        }


def _service_exceptions_on(
    gtfs_dir: Path, service_date: datetime.date
) -> tuple[set[str], set[str]]:
    date_text = service_date.strftime("%Y%m%d")
    added: set[str] = set()
    removed: set[str] = set()
    exceptions = gtfs_dir / "calendar_dates.txt"
    if not exceptions.exists():
        return added, removed
    with open(exceptions, encoding="utf-8-sig", newline="") as feed:
        for row in csv.DictReader(feed):
            if row["date"] != date_text:
                continue
            (added if row["exception_type"] == "1" else removed).add(row["service_id"])
    return added, removed


def active_services(gtfs_dir: Path, service_date: datetime.date) -> set[str]:
    """The service ids running that day: the calendar's weekday pattern, plus
    the exceptions that add the day and minus those that take it away."""
    regular = _services_by_calendar(gtfs_dir, service_date)
    added, removed = _service_exceptions_on(gtfs_dir, service_date)
    return (regular | added) - removed


def swiss_didok_by_stop_id(gtfs_dir: Path) -> dict[str, int]:
    mapping: dict[str, int] = {}
    with open(gtfs_dir / "stops.txt", encoding="utf-8-sig", newline="") as feed:
        for row in csv.DictReader(feed):
            didok_text = (row.get("didok") or "").strip()
            if is_swiss_didok_text(didok_text):
                mapping[row["stop_id"]] = int(didok_text)
    return mapping


def category_by_route_id(gtfs_dir: Path) -> dict[str, int]:
    routes: dict[str, int] = {}
    with open(gtfs_dir / "routes.txt", encoding="utf-8-sig", newline="") as feed:
        for row in csv.DictReader(feed):
            category = category_of(int(row["route_type"]))
            if category is not None:
                routes[row["route_id"]] = category
    return routes


def active_trips(gtfs_dir: Path, service_date: datetime.date) -> dict[str, int]:
    """Per trip running that day, the product category it is drawn as; trips on
    a route type we do not show are left out."""
    services = active_services(gtfs_dir, service_date)
    routes = category_by_route_id(gtfs_dir)
    trips: dict[str, int] = {}
    with open(gtfs_dir / "trips.txt", encoding="utf-8-sig", newline="") as feed:
        for row in csv.DictReader(feed):
            if row["route_id"] in routes and row["service_id"] in services:
                trips[row["trip_id"]] = routes[row["route_id"]]
    return trips


def _didok_by_stop_id_including_foreign(gtfs_dir: Path) -> dict[str, int]:
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


def _calls_in_sequence_order(
    numbered_calls: list[tuple[int, StopCall]],
) -> list[StopCall]:
    return [call for _, call in sorted(numbered_calls, key=lambda pair: pair[0])]


def stop_sequences(gtfs_dir: Path, trip_ids: set[str]) -> dict[str, list[StopCall]]:
    """Per requested trip, its calls in stop_sequence order, timed in seconds
    since midnight and running past 24 h where the trip does. Foreign stops stay
    in, because a trip may leave the country and come back."""
    didok_map = _didok_by_stop_id_including_foreign(gtfs_dir)
    numbered_calls_by_trip: dict[str, list[tuple[int, StopCall]]] = {
        trip: [] for trip in trip_ids
    }

    with open(gtfs_dir / "stop_times.txt", encoding="utf-8-sig", newline="") as feed:
        reader = csv.reader(feed)
        header = next(reader)
        column = {name: index for index, name in enumerate(header)}
        trip_at = column["trip_id"]
        arrival_at = column["arrival_time"]
        departure_at = column["departure_time"]
        stop_at = column["stop_id"]
        sequence_at = column["stop_sequence"]
        for row in reader:
            trip = row[trip_at]
            if trip not in numbered_calls_by_trip:
                continue
            didok = _resolve_didok(row[stop_at], didok_map)
            if didok is None:
                continue
            call = StopCall(
                didok=didok,
                arrival=seconds_since_midnight(row[arrival_at]),
                departure=seconds_since_midnight(row[departure_at]),
            )
            numbered_calls_by_trip[trip].append((int(row[sequence_at]), call))

    return {
        trip: _calls_in_sequence_order(numbered_calls)
        for trip, numbered_calls in numbered_calls_by_trip.items()
    }
