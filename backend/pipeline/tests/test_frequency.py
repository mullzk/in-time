import os
from pathlib import Path

import pytest

from pipeline.frequency import (
    FREQUENCY_MODE_BUS,
    FREQUENCY_MODE_RAIL,
    FREQUENCY_MODE_TRAM,
    FrequencyThresholds,
    RegularEdges,
    deserialize_regular_edges,
    frequency_mode_of_route_type,
    load_or_scan_regular_edges,
    scan_regular_edges,
    serialize_regular_edges,
)

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


def stops_txt(*bpuics: int) -> str:
    header = (
        "stop_id,stop_name,stop_lat,stop_lon,location_type,parent_station,"
        "platform_code,original_stop_id,didok\n"
    )
    rows = "".join(
        f'"{bpuic}","S{bpuic}","47.0","8.0","1","","","","{bpuic}"\n'
        for bpuic in bpuics
    )
    return header + rows


def trips_txt(*rows: tuple[str, str, str]) -> str:
    header = "route_id,service_id,trip_id\n"
    return header + "".join(
        f"{route},{service},{trip}\n" for route, service, trip in rows
    )


def stop_times(*trips: tuple[str, list[int]]) -> str:
    header = "trip_id,arrival_time,departure_time,stop_id,stop_sequence\n"
    rows = ""
    for trip_id, sequence in trips:
        for position, bpuic in enumerate(sequence):
            rows += f'"{trip_id}","08:00:00","08:00:00","{bpuic}","{position}"\n'
    return header + rows


@pytest.mark.parametrize(
    "route_type,expected",
    [
        (103, FREQUENCY_MODE_RAIL),
        (117, FREQUENCY_MODE_RAIL),
        (900, FREQUENCY_MODE_TRAM),
        (700, FREQUENCY_MODE_BUS),
        (702, FREQUENCY_MODE_BUS),
    ],
)
def test_frequency_mode_of_route_type_maps_kept_modes(
    route_type: int, expected: int
) -> None:
    assert frequency_mode_of_route_type(route_type) == expected


@pytest.mark.parametrize("route_type", [705, 710, 715, 202, 401, 1000, 1300, 1500])
def test_frequency_mode_of_route_type_excludes_other_modes(route_type: int) -> None:
    assert frequency_mode_of_route_type(route_type) is None


def test_edge_is_regular_with_enough_days_and_departures(tmp_path: Path) -> None:
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
    regular = scan_regular_edges(tmp_path, SMALL)
    assert regular.is_regular(A, B, FREQUENCY_MODE_RAIL)
    # Edges are undirected.
    assert regular.is_regular(B, A, FREQUENCY_MODE_RAIL)


def test_edge_with_too_few_days_is_irregular(tmp_path: Path) -> None:
    write_feed(
        tmp_path,
        {
            "stops.txt": stops_txt(A, B),
            "trips.txt": trips_txt(("R_RAIL", "RARE", "T1"), ("R_RAIL", "RARE", "T2")),
            "stop_times.txt": stop_times(("T1", [A, B]), ("T2", [A, B])),
        },
    )
    regular = scan_regular_edges(tmp_path, SMALL)
    assert not regular.is_regular(A, B, FREQUENCY_MODE_RAIL)


def test_edge_with_too_few_departures_is_irregular(tmp_path: Path) -> None:
    write_feed(
        tmp_path,
        {
            "stops.txt": stops_txt(A, B),
            # One daily trip: 10 days but only 1 departure/day.
            "trips.txt": trips_txt(("R_RAIL", "DAILY", "T1")),
            "stop_times.txt": stop_times(("T1", [A, B])),
        },
    )
    regular = scan_regular_edges(tmp_path, SMALL)
    assert not regular.is_regular(A, B, FREQUENCY_MODE_RAIL)


def test_mode_separates_edges_on_the_same_pair(tmp_path: Path) -> None:
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
    regular = scan_regular_edges(tmp_path, SMALL)
    assert regular.is_regular(A, B, FREQUENCY_MODE_RAIL)
    # Only one bus trip -> the bus edge stays irregular despite the busy rail pair.
    assert not regular.is_regular(A, B, FREQUENCY_MODE_BUS)


def test_trip_is_regular_only_when_all_edges_are(tmp_path: Path) -> None:
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
    regular = scan_regular_edges(tmp_path, SMALL)
    assert regular.trip_is_regular([A, B, C], FREQUENCY_MODE_RAIL)
    assert not regular.trip_is_regular([A, B, D], FREQUENCY_MODE_RAIL)


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
    regular = scan_regular_edges(tmp_path, SMALL)
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
    regular = scan_regular_edges(tmp_path, SMALL)
    assert regular.is_regular(A, B, FREQUENCY_MODE_RAIL)
    assert not regular.is_regular(A, FOREIGN, FREQUENCY_MODE_RAIL)


def test_serialize_round_trips_the_regular_edges() -> None:
    regular = RegularEdges(
        frozenset(
            {
                (A, B, FREQUENCY_MODE_RAIL),
                (B, C, FREQUENCY_MODE_TRAM),
                (A, D, FREQUENCY_MODE_BUS),
            }
        )
    )
    restored = deserialize_regular_edges(serialize_regular_edges(regular))
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
    cache = tmp_path / "regular_edges.bin"
    regular = load_or_scan_regular_edges(feed, cache, SMALL)

    assert cache.exists()
    assert regular.is_regular(A, B, FREQUENCY_MODE_RAIL)


def test_cache_hit_loads_without_scanning(tmp_path: Path) -> None:
    cache = tmp_path / "regular_edges.bin"
    cache.write_bytes(
        serialize_regular_edges(RegularEdges(frozenset({(A, B, FREQUENCY_MODE_RAIL)})))
    )
    # A missing feed dir would make a scan raise, proving the cache is used.
    regular = load_or_scan_regular_edges(tmp_path / "absent", cache, SMALL)

    assert regular.is_regular(A, B, FREQUENCY_MODE_RAIL)


@pytest.mark.realdata
@pytest.mark.skipif(not GTFS_DIR, reason="set GTFS_SCHEDULE_DIR to a GTFS feed")
def test_real_regular_edges_are_plausible() -> None:
    assert GTFS_DIR is not None
    regular = scan_regular_edges(Path(GTFS_DIR))
    assert len(regular) > 1000
