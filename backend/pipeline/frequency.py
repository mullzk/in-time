"""Frequency filter over a GTFS year: which (station-pair, mode) connections are
served regularly enough to appear in the base map.

Over the whole feed each service's operating days form a bitmask (calendar plus
calendar_dates); every connection accumulates the union of its trips' days and
their total departures. A connection is regular when it runs on enough days and
often enough per operating day. A trip is kept only if all of its connections are
regular, so a single irregular connection drops the trip — decommissioned lines
and rare seasonal variants vanish from the base map. Foreign stops are bridged: a
connection joins the surrounding Swiss stations."""

import array
import csv
import datetime
import struct
import sys
from collections.abc import Iterable, Iterator
from dataclasses import dataclass
from pathlib import Path

from pipeline.atomicio import write_atomically
from pipeline.gtfs import (
    CATEGORY_BUS,
    CATEGORY_TRAM,
    RAIL_CATEGORIES,
    WEEKDAY_COLUMNS,
    category_of,
    is_swiss_didok_text,
)

# Frequency-filter modes: a collapsed projection of the gtfs CATEGORY_* space.
# Tram and bus keep their category code; the rail subtypes (CATEGORY 0-4) all
# fold onto a single rail mode, because the filter treats rail as one mode.
FREQUENCY_MODE_RAIL = 0
FREQUENCY_MODE_TRAM = CATEGORY_TRAM
FREQUENCY_MODE_BUS = CATEGORY_BUS

REGULAR_CONNECTIONS_CACHE_NAME = "regular_connections.bin"

# The sidecar is cached per GTFS version, but its contents also depend on how a
# scanned connection is encoded — most subtly the frequency-mode numbering above.
# A cache written under an older meaning would be silently misread (tram and bus
# connections filed under retired mode codes, dropping every tram and bus). The
# header pins that meaning: bump _CACHE_VERSION whenever the encoded meaning of a
# connection changes; any cache lacking the current magic and version is treated
# as stale and rescanned rather than trusted.
_CACHE_MAGIC = b"ITRC"
_CACHE_VERSION = 1
_CACHE_HEADER = struct.Struct("<4sI")

Connection = tuple[int, int, int]


@dataclass(frozen=True)
class FrequencyThresholds:
    min_days: int = 300
    min_departures_per_day: int = 4


DEFAULT_FREQUENCY_THRESHOLDS = FrequencyThresholds()


def frequency_mode_of_category(category: int) -> int:
    return FREQUENCY_MODE_RAIL if category in RAIL_CATEGORIES else category


def _connection_key(first: int, second: int, mode: int) -> Connection:
    return (first, second, mode) if first < second else (second, first, mode)


class RegularConnections:
    """The connections that passed the frequency filter, answering both per
    connection and per trip."""

    def __init__(self, connections: frozenset[Connection]) -> None:
        self._connections = connections

    def __len__(self) -> int:
        return len(self._connections)

    def __iter__(self) -> Iterator[Connection]:
        return iter(self._connections)

    def is_regular(self, first: int, second: int, mode: int) -> bool:
        return _connection_key(first, second, mode) in self._connections

    def trip_is_regular(self, stations: list[int], mode: int) -> bool:
        return all(
            self.is_regular(first, second, mode)
            for first, second in zip(stations, stations[1:], strict=False)
            if first != second
        )

    def trip_has_regular_connection(self, stations: list[int], mode: int) -> bool:
        return any(
            self.is_regular(first, second, mode)
            for first, second in zip(stations, stations[1:], strict=False)
            if first != second
        )


def _trip_modes_and_services(gtfs_dir: Path) -> tuple[dict[str, int], dict[str, str]]:
    route_mode: dict[str, int] = {}
    with open(gtfs_dir / "routes.txt", encoding="utf-8-sig", newline="") as feed:
        for row in csv.DictReader(feed):
            category = category_of(int(row["route_type"]))
            if category is not None:
                route_mode[row["route_id"]] = frequency_mode_of_category(category)

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


def _start_date_of_mask(
    calendar_rows: list[dict[str, str]], exceptions: list[tuple[str, str, str]]
) -> datetime.date:
    starts = [row["start_date"] for row in calendar_rows]
    starts += [date for _service, date, _kind in exceptions]
    earliest_year = min(_parse_date(date).year for date in starts)
    return datetime.date(earliest_year, 1, 1)


def _operating_day_masks(gtfs_dir: Path, needed: set[str]) -> dict[str, int]:
    calendar_rows = _calendar_rows(gtfs_dir, needed)
    exceptions = _calendar_exceptions(gtfs_dir, needed)
    if not calendar_rows and not exceptions:
        return {}

    start_date_of_mask = _start_date_of_mask(calendar_rows, exceptions)
    operating_day_masks: dict[str, int] = {}
    for row in calendar_rows:
        active_weekdays = [row[column] == "1" for column in WEEKDAY_COLUMNS]
        day = _parse_date(row["start_date"])
        end = _parse_date(row["end_date"])
        operating_day_mask = 0
        while day <= end:
            if active_weekdays[day.weekday()]:
                operating_day_mask |= 1 << (day - start_date_of_mask).days
            day += datetime.timedelta(days=1)
        operating_day_masks[row["service_id"]] = operating_day_mask

    for service_id, date, kind in exceptions:
        bit = 1 << (_parse_date(date) - start_date_of_mask).days
        if kind == "1":
            operating_day_masks[service_id] = (
                operating_day_masks.get(service_id, 0) | bit
            )
        else:
            operating_day_masks[service_id] = (
                operating_day_masks.get(service_id, 0) & ~bit
            )
    return operating_day_masks


def _swiss_didok_by_stop_id(gtfs_dir: Path) -> dict[str, int]:
    mapping: dict[str, int] = {}
    with open(gtfs_dir / "stops.txt", encoding="utf-8-sig", newline="") as feed:
        for row in csv.DictReader(feed):
            didok = (row.get("didok") or "").strip()
            if is_swiss_didok_text(didok):
                mapping[row["stop_id"]] = int(didok)
    return mapping


class _ConnectionTraffic:
    """Accumulates operating days and departures per connection over the whole
    feed, then decides which of them run regularly enough."""

    def __init__(self) -> None:
        self._operating_day_masks: dict[Connection, int] = {}
        self._departures: dict[Connection, int] = {}

    def add_trip(
        self, stations: Iterable[int], mode: int, operating_day_mask: int
    ) -> None:
        operating_day_count = operating_day_mask.bit_count()
        if operating_day_count == 0:
            return
        seen: set[Connection] = set()
        previous: int | None = None
        for station in stations:
            if previous is not None and previous != station:
                connection = _connection_key(previous, station, mode)
                if connection not in seen:
                    seen.add(connection)
                    self._operating_day_masks[connection] = (
                        self._operating_day_masks.get(connection, 0)
                        | operating_day_mask
                    )
                    self._departures[connection] = (
                        self._departures.get(connection, 0) + operating_day_count
                    )
            previous = station

    def regular_connections(
        self, thresholds: FrequencyThresholds
    ) -> frozenset[Connection]:
        return frozenset(
            connection
            for connection, operating_day_mask in self._operating_day_masks.items()
            if self._is_regular(
                operating_day_mask.bit_count(), self._departures[connection], thresholds
            )
        )

    @staticmethod
    def _is_regular(
        connection_operating_days: int, departures: int, thresholds: FrequencyThresholds
    ) -> bool:
        return (
            connection_operating_days >= thresholds.min_days
            and departures
            >= connection_operating_days * thresholds.min_departures_per_day
        )


def _accumulate_connections(
    gtfs_dir: Path,
    trip_mode: dict[str, int],
    trip_service: dict[str, str],
    operating_day_masks: dict[str, int],
    stop_didok: dict[str, int],
) -> _ConnectionTraffic:
    """Requires stop_times.txt rows to be contiguous per trip_id: the scan is
    single-pass and flushes a trip as soon as the trip_id changes, so a
    fragmented trip would drop its cross-fragment connection and double-count shared
    ones. This trades robustness for bounded memory (~1.8M trips / 28M rows in
    the Swiss feed) — unlike `gtfs.stop_sequences`, which groups into a dict but
    only for a pre-filtered trip set. GTFS recommends but does not guarantee the
    grouping; the current national feed satisfies it."""
    traffic = _ConnectionTraffic()

    def record_trip(trip_id: str, ordered: list[tuple[int, int]]) -> None:
        mode = trip_mode.get(trip_id)
        operating_day_mask = operating_day_masks.get(trip_service.get(trip_id, ""), 0)
        if mode is None or operating_day_mask == 0:
            return
        stations = [didok for _sequence, didok in sorted(ordered)]
        traffic.add_trip(stations, mode, operating_day_mask)

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
                    record_trip(current, ordered)
                current = trip_id
                ordered = []
            didok = stop_didok.get(row[stop_at])
            if didok is not None:
                ordered.append((int(row[sequence_at]), didok))
        if current is not None:
            record_trip(current, ordered)
    return traffic


def scan_regular_connections(
    gtfs_dir: Path,
    thresholds: FrequencyThresholds = DEFAULT_FREQUENCY_THRESHOLDS,
) -> RegularConnections:
    trip_mode, trip_service = _trip_modes_and_services(gtfs_dir)
    operating_day_masks = _operating_day_masks(gtfs_dir, set(trip_service.values()))
    stop_didok = _swiss_didok_by_stop_id(gtfs_dir)
    traffic = _accumulate_connections(
        gtfs_dir, trip_mode, trip_service, operating_day_masks, stop_didok
    )
    return RegularConnections(traffic.regular_connections(thresholds))


# The `i` item width is the platform's native int, but the sidecar never leaves
# the host that wrote it (regenerated per host and per GTFS version), so it is
# always read back at the same width; only byte order needs normalising.
def serialize_regular_connections(regular: RegularConnections) -> bytes:
    flat = array.array("i")
    for first, second, mode in regular:
        flat.extend((first, second, mode))
    if sys.byteorder == "big":
        flat.byteswap()
    return _CACHE_HEADER.pack(_CACHE_MAGIC, _CACHE_VERSION) + flat.tobytes()


def deserialize_regular_connections(data: bytes) -> RegularConnections:
    if len(data) < _CACHE_HEADER.size:
        raise ValueError("truncated regular-connections cache")
    magic, version = _CACHE_HEADER.unpack_from(data)
    if magic != _CACHE_MAGIC or version != _CACHE_VERSION:
        raise ValueError("stale or unrecognized regular-connections cache")
    payload = data[_CACHE_HEADER.size :]
    if len(payload) % (array.array("i").itemsize * 3) != 0:
        raise ValueError("truncated regular-connections cache")
    flat = array.array("i")
    flat.frombytes(payload)
    if sys.byteorder == "big":
        flat.byteswap()
    connections = {
        (flat[index], flat[index + 1], flat[index + 2])
        for index in range(0, len(flat), 3)
    }
    return RegularConnections(frozenset(connections))


def load_or_scan_regular_connections(
    gtfs_dir: Path,
    cache_path: Path,
    thresholds: FrequencyThresholds = DEFAULT_FREQUENCY_THRESHOLDS,
) -> RegularConnections:
    # The scan reads the whole yearly feed (~1 min), but its result depends only
    # on the GTFS version, so it is cached per version and only recomputed when a
    # new feed appears and its cache is absent.
    if cache_path.exists():
        try:
            return deserialize_regular_connections(cache_path.read_bytes())
        except ValueError:
            pass  # stale or unrecognized cache -> rescan and overwrite it below
    regular = scan_regular_connections(gtfs_dir, thresholds)
    write_atomically(cache_path, serialize_regular_connections(regular))
    return regular
