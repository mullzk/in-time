"""Frequency filter over a GTFS year: which (station-pair, mode) edges are served
regularly enough to appear in the base map.

Over the whole feed each service's operating days form a bitmask (calendar plus
calendar_dates); every edge accumulates the union of its trips' days and their
total departures. An edge is regular when it runs on enough days and often enough
per operating day. A trip is kept only if all of its edges are regular, so a
single irregular edge drops the trip — decommissioned lines and rare seasonal
variants vanish from the shared edge list. Foreign stops are bridged: an edge
connects the surrounding Swiss stations."""

import array
import csv
import datetime
import sys
from collections.abc import Iterable, Iterator
from dataclasses import dataclass
from pathlib import Path

from pipeline.gtfs import (
    BUS_ROUTE_TYPES,
    CATEGORY_BUS,
    CATEGORY_TRAM,
    RAIL_ROUTE_TYPES,
    TRAM_ROUTE_TYPE,
)

FREQUENCY_MODE_RAIL = 0
FREQUENCY_MODE_TRAM = 1
FREQUENCY_MODE_BUS = 2

SWISS_BPUIC_PREFIX = "85"
REGULAR_EDGES_CACHE_NAME = "regular_edges.bin"


def is_swiss_bpuic(bpuic: int) -> bool:
    return str(bpuic).startswith(SWISS_BPUIC_PREFIX)


_WEEKDAY_COLUMNS = [
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday",
]

Edge = tuple[int, int, int]


@dataclass(frozen=True)
class FrequencyThresholds:
    min_days: int = 300
    min_departures_per_day: int = 4


DEFAULT_FREQUENCY_THRESHOLDS = FrequencyThresholds()


def frequency_mode_of_route_type(route_type: int) -> int | None:
    if route_type in RAIL_ROUTE_TYPES:
        return FREQUENCY_MODE_RAIL
    if route_type == TRAM_ROUTE_TYPE:
        return FREQUENCY_MODE_TRAM
    if route_type in BUS_ROUTE_TYPES:
        return FREQUENCY_MODE_BUS
    return None


def frequency_mode_of_category(category: int) -> int:
    if category == CATEGORY_TRAM:
        return FREQUENCY_MODE_TRAM
    if category == CATEGORY_BUS:
        return FREQUENCY_MODE_BUS
    return FREQUENCY_MODE_RAIL


def _edge_key(first: int, second: int, mode: int) -> Edge:
    return (first, second, mode) if first < second else (second, first, mode)


class RegularEdges:
    def __init__(self, edges: frozenset[Edge]) -> None:
        self._edges = edges

    def __len__(self) -> int:
        return len(self._edges)

    def __iter__(self) -> Iterator[Edge]:
        return iter(self._edges)

    def is_regular(self, first: int, second: int, mode: int) -> bool:
        return _edge_key(first, second, mode) in self._edges

    def trip_is_regular(self, stations: list[int], mode: int) -> bool:
        return all(
            self.is_regular(first, second, mode)
            for first, second in zip(stations, stations[1:], strict=False)
            if first != second
        )


def _trip_modes_and_services(gtfs_dir: Path) -> tuple[dict[str, int], dict[str, str]]:
    route_mode: dict[str, int] = {}
    with open(gtfs_dir / "routes.txt", encoding="utf-8-sig", newline="") as feed:
        for row in csv.DictReader(feed):
            mode = frequency_mode_of_route_type(int(row["route_type"]))
            if mode is not None:
                route_mode[row["route_id"]] = mode

    trip_mode: dict[str, int] = {}
    trip_service: dict[str, str] = {}
    with open(gtfs_dir / "trips.txt", encoding="utf-8-sig", newline="") as feed:
        for row in csv.DictReader(feed):
            mode = route_mode.get(row["route_id"])
            if mode is not None:
                trip_mode[row["trip_id"]] = mode
                trip_service[row["trip_id"]] = row["service_id"]
    return trip_mode, trip_service


def _parse_date(yyyymmdd: str) -> datetime.date:
    return datetime.date(int(yyyymmdd[:4]), int(yyyymmdd[4:6]), int(yyyymmdd[6:8]))


def _calendar_rows(gtfs_dir: Path, needed: set[str]) -> list[dict[str, str]]:
    with open(gtfs_dir / "calendar.txt", encoding="utf-8-sig", newline="") as feed:
        return [row for row in csv.DictReader(feed) if row["service_id"] in needed]


def _calendar_exceptions(
    gtfs_dir: Path, needed: set[str]
) -> list[tuple[str, str, str]]:
    exceptions_path = gtfs_dir / "calendar_dates.txt"
    if not exceptions_path.exists():
        return []
    with open(exceptions_path, encoding="utf-8-sig", newline="") as feed:
        return [
            (row["service_id"], row["date"], row["exception_type"])
            for row in csv.DictReader(feed)
            if row["service_id"] in needed
        ]


def _epoch(
    calendar_rows: list[dict[str, str]], exceptions: list[tuple[str, str, str]]
) -> datetime.date:
    starts = [row["start_date"] for row in calendar_rows]
    starts += [date for _service, date, _kind in exceptions]
    earliest_year = min(_parse_date(date).year for date in starts)
    return datetime.date(earliest_year, 1, 1)


def _service_masks(gtfs_dir: Path, needed: set[str]) -> dict[str, int]:
    calendar_rows = _calendar_rows(gtfs_dir, needed)
    exceptions = _calendar_exceptions(gtfs_dir, needed)
    if not calendar_rows and not exceptions:
        return {}

    epoch = _epoch(calendar_rows, exceptions)
    masks: dict[str, int] = {}
    for row in calendar_rows:
        active_weekdays = [row[column] == "1" for column in _WEEKDAY_COLUMNS]
        day = _parse_date(row["start_date"])
        end = _parse_date(row["end_date"])
        mask = 0
        while day <= end:
            if active_weekdays[day.weekday()]:
                mask |= 1 << (day - epoch).days
            day += datetime.timedelta(days=1)
        masks[row["service_id"]] = mask

    for service_id, date, kind in exceptions:
        bit = 1 << (_parse_date(date) - epoch).days
        if kind == "1":
            masks[service_id] = masks.get(service_id, 0) | bit
        else:
            masks[service_id] = masks.get(service_id, 0) & ~bit
    return masks


def _swiss_stop_bpuic(gtfs_dir: Path) -> dict[str, int]:
    mapping: dict[str, int] = {}
    with open(gtfs_dir / "stops.txt", encoding="utf-8-sig", newline="") as feed:
        for row in csv.DictReader(feed):
            bpuic = (row.get("didok") or "").strip()
            if bpuic.isdigit() and bpuic.startswith(SWISS_BPUIC_PREFIX):
                mapping[row["stop_id"]] = int(bpuic)
    return mapping


class _EdgeTraffic:
    def __init__(self) -> None:
        self._mask: dict[Edge, int] = {}
        self._departures: dict[Edge, int] = {}

    def add_trip(self, stations: Iterable[int], mode: int, mask: int) -> None:
        operating_days = mask.bit_count()
        if operating_days == 0:
            return
        seen: set[Edge] = set()
        previous: int | None = None
        for station in stations:
            if previous is not None and previous != station:
                edge = _edge_key(previous, station, mode)
                if edge not in seen:
                    seen.add(edge)
                    self._mask[edge] = self._mask.get(edge, 0) | mask
                    self._departures[edge] = (
                        self._departures.get(edge, 0) + operating_days
                    )
            previous = station

    def regular(self, thresholds: FrequencyThresholds) -> frozenset[Edge]:
        return frozenset(
            edge
            for edge, mask in self._mask.items()
            if self._is_regular(mask.bit_count(), self._departures[edge], thresholds)
        )

    @staticmethod
    def _is_regular(
        operating_days: int, departures: int, thresholds: FrequencyThresholds
    ) -> bool:
        return (
            operating_days >= thresholds.min_days
            and departures >= operating_days * thresholds.min_departures_per_day
        )


def _accumulate_edges(
    gtfs_dir: Path,
    trip_mode: dict[str, int],
    trip_service: dict[str, str],
    service_masks: dict[str, int],
    stop_bpuic: dict[str, int],
) -> _EdgeTraffic:
    traffic = _EdgeTraffic()

    def flush(trip_id: str, ordered: list[tuple[int, int]]) -> None:
        mode = trip_mode.get(trip_id)
        mask = service_masks.get(trip_service.get(trip_id, ""), 0)
        if mode is None or mask == 0:
            return
        stations = [bpuic for _sequence, bpuic in sorted(ordered)]
        traffic.add_trip(stations, mode, mask)

    with open(gtfs_dir / "stop_times.txt", encoding="utf-8-sig", newline="") as feed:
        reader = csv.reader(feed)
        header = next(reader)
        column = {name: index for index, name in enumerate(header)}
        trip_at = column["trip_id"]
        stop_at = column["stop_id"]
        sequence_at = column["stop_sequence"]

        current: str | None = None
        ordered: list[tuple[int, int]] = []
        for row in reader:
            trip_id = row[trip_at]
            if trip_id != current:
                if current is not None:
                    flush(current, ordered)
                current = trip_id
                ordered = []
            bpuic = stop_bpuic.get(row[stop_at])
            if bpuic is not None:
                ordered.append((int(row[sequence_at]), bpuic))
        if current is not None:
            flush(current, ordered)
    return traffic


def scan_regular_edges(
    gtfs_dir: Path,
    thresholds: FrequencyThresholds = DEFAULT_FREQUENCY_THRESHOLDS,
) -> RegularEdges:
    trip_mode, trip_service = _trip_modes_and_services(gtfs_dir)
    service_masks = _service_masks(gtfs_dir, set(trip_service.values()))
    stop_bpuic = _swiss_stop_bpuic(gtfs_dir)
    traffic = _accumulate_edges(
        gtfs_dir, trip_mode, trip_service, service_masks, stop_bpuic
    )
    return RegularEdges(traffic.regular(thresholds))


def serialize_regular_edges(regular: RegularEdges) -> bytes:
    flat = array.array("i")
    for first, second, mode in regular:
        flat.extend((first, second, mode))
    if sys.byteorder == "big":
        flat.byteswap()
    return flat.tobytes()


def deserialize_regular_edges(data: bytes) -> RegularEdges:
    flat = array.array("i")
    flat.frombytes(data)
    if sys.byteorder == "big":
        flat.byteswap()
    edges = {
        (flat[index], flat[index + 1], flat[index + 2])
        for index in range(0, len(flat), 3)
    }
    return RegularEdges(frozenset(edges))


def load_or_scan_regular_edges(
    gtfs_dir: Path,
    cache_path: Path,
    thresholds: FrequencyThresholds = DEFAULT_FREQUENCY_THRESHOLDS,
) -> RegularEdges:
    # The scan reads the whole yearly feed (~1 min), but its result depends only
    # on the GTFS version, so it is cached per version and only recomputed when a
    # new feed appears and its cache is absent.
    if cache_path.exists():
        return deserialize_regular_edges(cache_path.read_bytes())
    regular = scan_regular_edges(gtfs_dir, thresholds)
    cache_path.write_bytes(serialize_regular_edges(regular))
    return regular
