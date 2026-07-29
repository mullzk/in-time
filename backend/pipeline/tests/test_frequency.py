import os
from pathlib import Path

import pytest

from pipeline.frequency import (
    FREQUENCY_MODE_BUS,
    FREQUENCY_MODE_RAIL,
    FREQUENCY_MODE_TRAM,
    FrequencyThresholds,
    RegularConnections,
    deserialize_regular_connections,
    frequency_mode_of_category,
    load_or_scan_regular_connections,
    scan_regular_connections,
    serialize_regular_connections,
)
from pipeline.gtfs import CATEGORY_BUS, CATEGORY_TRAM
from pipeline.tests.feeds import stop_times, stops_txt, trips_txt

GTFS_DIR = os.environ.get("GTFS_SCHEDULE_DIR")

# Small thresholds keep the fixtures tiny; the real 300-days / 4-per-day numbers
# are exercised at Ebene B.
SMALL = FrequencyThresholds(min_days=3, min_departures_per_day=2)

A, B, C, D = 8500001, 8500002, 8500003, 8500004
FOREIGN = 8002140

CALENDAR = (
    "service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,"
    "start_date,end_date\n"
    "DAILY,1,1,1,1,1,1,1,20260101,20260110\n"  # 10 operating days
    "RARE,1,1,1,1,1,1,1,20260101,20260102\n"  # 2 operating days
)

ROUTES = (
    "route_id,agency_id,route_short_name,route_long_name,route_desc,route_type\n"
    "R_RAIL,,IR,,,103\n"
    "R_BUS,,B,,,700\n"
)


def write_feed(directory: Path, files: dict[str, str]) -> None:
    directory.mkdir(parents=True, exist_ok=True)
    base = {"calendar.txt": CALENDAR, "routes.txt": ROUTES}
    for name, content in {**base, **files}.items():
        (directory / name).write_text(content, encoding="utf-8")


@pytest.mark.parametrize(
    "category,expected",
    [
        (0, FREQUENCY_MODE_RAIL),
        (1, FREQUENCY_MODE_RAIL),
        (2, FREQUENCY_MODE_RAIL),
        (3, FREQUENCY_MODE_RAIL),
        (4, FREQUENCY_MODE_RAIL),
        (CATEGORY_TRAM, FREQUENCY_MODE_TRAM),
        (CATEGORY_BUS, FREQUENCY_MODE_BUS),
    ],
)
def test_frequency_mode_of_category_collapses_rail_subtypes(
    category: int, expected: int
) -> None:
    assert frequency_mode_of_category(category) == expected


def test_connection_is_regular_with_enough_days_and_departures(tmp_path: Path) -> None:
    write_feed(
        tmp_path,
        {
            "stops.txt": stops_txt(A, B),
            # Two daily trips on A-B: 10 days, 20 departures -> 2/day.
            "trips.txt": trips_txt(
                ("R_RAIL", "DAILY", "T1"), ("R_RAIL", "DAILY", "T2")
            ),
            "stop_times.txt": stop_times(("T1", [A, B]), ("T2", [A, B])),
        },
    )
    regular = scan_regular_connections(tmp_path, SMALL)
    assert regular.is_regular(A, B, FREQUENCY_MODE_RAIL)
    # Connections are undirected.
    assert regular.is_regular(B, A, FREQUENCY_MODE_RAIL)


def test_connection_with_too_few_days_is_irregular(tmp_path: Path) -> None:
    write_feed(
        tmp_path,
        {
            "stops.txt": stops_txt(A, B),
            "trips.txt": trips_txt(("R_RAIL", "RARE", "T1"), ("R_RAIL", "RARE", "T2")),
            "stop_times.txt": stop_times(("T1", [A, B]), ("T2", [A, B])),
        },
    )
    regular = scan_regular_connections(tmp_path, SMALL)
    assert not regular.is_regular(A, B, FREQUENCY_MODE_RAIL)


def test_connection_with_too_few_departures_is_irregular(tmp_path: Path) -> None:
    write_feed(
        tmp_path,
        {
            "stops.txt": stops_txt(A, B),
            # One daily trip: 10 days but only 1 departure/day.
            "trips.txt": trips_txt(("R_RAIL", "DAILY", "T1")),
            "stop_times.txt": stop_times(("T1", [A, B])),
        },
    )
    regular = scan_regular_connections(tmp_path, SMALL)
    assert not regular.is_regular(A, B, FREQUENCY_MODE_RAIL)


def test_mode_separates_connections_on_the_same_pair(tmp_path: Path) -> None:
    write_feed(
        tmp_path,
        {
            "stops.txt": stops_txt(A, B),
            "trips.txt": trips_txt(
                ("R_RAIL", "DAILY", "T1"),
                ("R_RAIL", "DAILY", "T2"),
                ("R_BUS", "DAILY", "TB"),
            ),
            "stop_times.txt": stop_times(
                ("T1", [A, B]), ("T2", [A, B]), ("TB", [A, B])
            ),
        },
    )
    regular = scan_regular_connections(tmp_path, SMALL)
    assert regular.is_regular(A, B, FREQUENCY_MODE_RAIL)
    # Only one bus trip -> the bus connection stays irregular despite the busy rail
    # pair.
    assert not regular.is_regular(A, B, FREQUENCY_MODE_BUS)


def test_trip_is_regular_only_when_all_connections_are(tmp_path: Path) -> None:
    write_feed(
        tmp_path,
        {
            "stops.txt": stops_txt(A, B, C, D),
            "trips.txt": trips_txt(
                ("R_RAIL", "DAILY", "T1"), ("R_RAIL", "DAILY", "T2")
            ),
            # A-B and B-C are busy; D is never served.
            "stop_times.txt": stop_times(("T1", [A, B, C]), ("T2", [A, B, C])),
        },
    )
    regular = scan_regular_connections(tmp_path, SMALL)
    assert regular.trip_is_regular([A, B, C], FREQUENCY_MODE_RAIL)
    assert not regular.trip_is_regular([A, B, D], FREQUENCY_MODE_RAIL)


def test_trip_has_regular_connection_needs_only_one() -> None:
    regular = RegularConnections(frozenset({(A, B, FREQUENCY_MODE_BUS)}))

    # A-B is regular, so a trip touching it survives despite the irregular B-C.
    assert regular.trip_has_regular_connection([A, B, C], FREQUENCY_MODE_BUS)
    # No regular connection at all -> nothing to keep.
    assert not regular.trip_has_regular_connection([B, C, D], FREQUENCY_MODE_BUS)
    assert not regular.trip_has_regular_connection([A, B], FREQUENCY_MODE_RAIL)


def test_calendar_dates_add_and_remove_change_operating_days(tmp_path: Path) -> None:
    write_feed(
        tmp_path,
        {
            "stops.txt": stops_txt(A, B),
            "trips.txt": trips_txt(("R_RAIL", "RARE", "T1"), ("R_RAIL", "RARE", "T2")),
            # RARE has 2 base days; add a third so it reaches min_days=3.
            "calendar_dates.txt": "service_id,date,exception_type\nRARE,20260103,1\n",
            "stop_times.txt": stop_times(("T1", [A, B]), ("T2", [A, B])),
        },
    )
    regular = scan_regular_connections(tmp_path, SMALL)
    assert regular.is_regular(A, B, FREQUENCY_MODE_RAIL)


def test_foreign_stops_are_bridged(tmp_path: Path) -> None:
    write_feed(
        tmp_path,
        {
            "stops.txt": stops_txt(A, B),
            "trips.txt": trips_txt(
                ("R_RAIL", "DAILY", "T1"), ("R_RAIL", "DAILY", "T2")
            ),
            # A foreign stop sits between the two Swiss stops.
            "stop_times.txt": stop_times(
                ("T1", [A, FOREIGN, B]), ("T2", [A, FOREIGN, B])
            ),
        },
    )
    regular = scan_regular_connections(tmp_path, SMALL)
    assert regular.is_regular(A, B, FREQUENCY_MODE_RAIL)
    assert not regular.is_regular(A, FOREIGN, FREQUENCY_MODE_RAIL)


def test_serialize_round_trips_the_regular_connections() -> None:
    regular = RegularConnections(
        frozenset(
            {
                (A, B, FREQUENCY_MODE_RAIL),
                (B, C, FREQUENCY_MODE_TRAM),
                (A, D, FREQUENCY_MODE_BUS),
            }
        )
    )
    restored = deserialize_regular_connections(serialize_regular_connections(regular))
    assert set(restored) == set(regular)


def test_cache_miss_scans_and_writes_the_cache(tmp_path: Path) -> None:
    feed = tmp_path / "feed"
    write_feed(
        feed,
        {
            "stops.txt": stops_txt(A, B),
            "trips.txt": trips_txt(
                ("R_RAIL", "DAILY", "T1"), ("R_RAIL", "DAILY", "T2")
            ),
            "stop_times.txt": stop_times(("T1", [A, B]), ("T2", [A, B])),
        },
    )
    cache = tmp_path / "regular_connections.bin"
    regular = load_or_scan_regular_connections(feed, cache, SMALL)

    assert cache.exists()
    assert regular.is_regular(A, B, FREQUENCY_MODE_RAIL)


def test_cache_hit_loads_without_scanning(tmp_path: Path) -> None:
    cache = tmp_path / "regular_connections.bin"
    cache.write_bytes(
        serialize_regular_connections(
            RegularConnections(frozenset({(A, B, FREQUENCY_MODE_RAIL)}))
        )
    )
    # A missing feed dir would make a scan raise, proving the cache is used.
    regular = load_or_scan_regular_connections(tmp_path / "absent", cache, SMALL)

    assert regular.is_regular(A, B, FREQUENCY_MODE_RAIL)


def test_stale_cache_is_rescanned_and_rewritten(tmp_path: Path) -> None:
    feed = tmp_path / "feed"
    write_feed(
        feed,
        {
            "stops.txt": stops_txt(A, B),
            "trips.txt": trips_txt(
                ("R_RAIL", "DAILY", "T1"), ("R_RAIL", "DAILY", "T2")
            ),
            "stop_times.txt": stop_times(("T1", [A, B]), ("T2", [A, B])),
        },
    )
    cache = tmp_path / "regular_connections.bin"
    cache.write_bytes(b"OLD\x00" + b"\x00" * 12)  # a pre-header, unrecognized cache

    regular = load_or_scan_regular_connections(feed, cache, SMALL)

    assert regular.is_regular(A, B, FREQUENCY_MODE_RAIL)
    # It was rewritten in the current format, so a second call serves it from the
    # cache alone -- an absent feed would make a rescan raise.
    reused = load_or_scan_regular_connections(tmp_path / "absent", cache, SMALL)
    assert set(reused) == set(regular)


def test_truncated_cache_is_rescanned_not_crashed(tmp_path: Path) -> None:
    feed = tmp_path / "feed"
    write_feed(
        feed,
        {
            "stops.txt": stops_txt(A, B),
            "trips.txt": trips_txt(
                ("R_RAIL", "DAILY", "T1"), ("R_RAIL", "DAILY", "T2")
            ),
            "stop_times.txt": stop_times(("T1", [A, B]), ("T2", [A, B])),
        },
    )
    cache = tmp_path / "regular_connections.bin"
    one_connection = serialize_regular_connections(
        RegularConnections(frozenset({(A, B, FREQUENCY_MODE_RAIL)}))
    )
    cache.write_bytes(one_connection[:-8])  # header intact, payload cut mid-record

    regular = load_or_scan_regular_connections(feed, cache, SMALL)

    assert regular.is_regular(A, B, FREQUENCY_MODE_RAIL)


@pytest.mark.realdata
@pytest.mark.skipif(not GTFS_DIR, reason="set GTFS_SCHEDULE_DIR to a GTFS feed")
def test_real_regular_connections_are_plausible() -> None:
    assert GTFS_DIR is not None
    regular = scan_regular_connections(Path(GTFS_DIR))
    assert len(regular) > 1000
