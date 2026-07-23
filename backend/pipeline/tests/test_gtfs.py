import datetime
from pathlib import Path

import pytest

from pipeline.gtfs import (
    CATEGORY_BUS,
    CATEGORY_TRAM,
    active_rail_trips,
    active_services,
    active_trips,
    category_of,
    seconds_since_midnight,
    stop_sequences,
)

THURSDAY = datetime.date(2026, 7, 16)


def write_gtfs(directory: Path, files: dict[str, str]) -> None:
    directory.mkdir(parents=True, exist_ok=True)
    for name, content in files.items():
        (directory / name).write_text(content, encoding="utf-8")


CALENDAR = (
    "service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,"
    "start_date,end_date\n"
    "WD,1,1,1,1,1,0,0,20260101,20261231\n"
    "WE,0,0,0,0,0,1,1,20260101,20261231\n"
)


@pytest.mark.parametrize(
    "route_type,expected",
    [(101, 0), (102, 0), (103, 1), (100, 2), (106, 2), (107, 2), (109, 3), (105, 4)],
)
def test_category_of_rail(route_type: int, expected: int) -> None:
    assert category_of(route_type) == expected


@pytest.mark.parametrize(
    "route_type,expected",
    [(900, CATEGORY_TRAM), (700, CATEGORY_BUS), (702, CATEGORY_BUS)],
)
def test_category_of_tram_and_bus(route_type: int, expected: int) -> None:
    assert category_of(route_type) == expected


@pytest.mark.parametrize("route_type", [705, 710, 715, 202, 1000, 1300, 1500, 3])
def test_category_of_excluded_modes_is_none(route_type: int) -> None:
    assert category_of(route_type) is None


def test_seconds_since_midnight_allows_past_24h() -> None:
    assert seconds_since_midnight("08:05:30") == 8 * 3600 + 5 * 60 + 30
    assert seconds_since_midnight("25:30:15") == 25 * 3600 + 30 * 60 + 15


def test_active_services_applies_calendar_and_exceptions(tmp_path: Path) -> None:
    write_gtfs(
        tmp_path,
        {
            "calendar.txt": CALENDAR,
            # Thursday: remove the weekday service, add the weekend one.
            "calendar_dates.txt": (
                "service_id,date,exception_type\nWD,20260716,2\nWE,20260716,1\n"
            ),
        },
    )
    assert active_services(tmp_path, THURSDAY) == {"WE"}


def test_active_rail_trips_excludes_non_rail(tmp_path: Path) -> None:
    write_gtfs(
        tmp_path,
        {
            "calendar.txt": CALENDAR,
            "routes.txt": (
                "route_id,agency_id,route_short_name,route_long_name,route_desc,"
                "route_type\n"
                "R_IR,,IR,,,103\n"
                "R_BUS,,B,,,700\n"
            ),
            "trips.txt": (
                "route_id,service_id,trip_id\nR_IR,WD,T_IR\nR_BUS,WD,T_BUS\n"
            ),
        },
    )
    assert active_rail_trips(tmp_path, THURSDAY) == {"T_IR": 1}


def test_active_trips_keeps_rail_tram_and_bus(tmp_path: Path) -> None:
    write_gtfs(
        tmp_path,
        {
            "calendar.txt": CALENDAR,
            "routes.txt": (
                "route_id,agency_id,route_short_name,route_long_name,route_desc,"
                "route_type\n"
                "R_IR,,IR,,,103\n"
                "R_TRAM,,T,,,900\n"
                "R_BUS,,B,,,700\n"
                "R_NIGHTBUS,,N,,,705\n"
            ),
            "trips.txt": (
                "route_id,service_id,trip_id\n"
                "R_IR,WD,T_IR\nR_TRAM,WD,T_TRAM\nR_BUS,WD,T_BUS\nR_NIGHTBUS,WD,T_NIGHT\n"
            ),
        },
    )
    assert active_trips(tmp_path, THURSDAY) == {
        "T_IR": 1,
        "T_TRAM": CATEGORY_TRAM,
        "T_BUS": CATEGORY_BUS,
    }


def test_stop_sequences_sorted_and_drops_unresolvable(tmp_path: Path) -> None:
    write_gtfs(
        tmp_path,
        {
            "stops.txt": (
                "stop_id,stop_name,stop_lat,stop_lon,didok\n"
                "8507000,Bern,46.94,7.44,8507000\n"
                "FOREIGN_X,Foreign,48.0,7.0,\n"
            ),
            # Out of order; a foreign stop that resolves to no DiDok.
            "stop_times.txt": (
                "trip_id,arrival_time,departure_time,stop_id,stop_sequence\n"
                "T1,08:02:00,08:03:00,8510000,2\n"
                "T1,08:00:00,08:00:30,8507000,1\n"
                "T1,08:10:00,08:10:00,FOREIGN_X,3\n"
            ),
        },
    )
    calls = stop_sequences(tmp_path, {"T1"})["T1"]

    assert [call.didok for call in calls] == [8507000, 8510000]
    assert calls[0].arr == 8 * 3600
    assert calls[0].dep == 8 * 3600 + 30
    assert calls[1].arr == 8 * 3600 + 2 * 60
    # Times stay monotonic along the sorted sequence.
    assert calls[0].dep <= calls[1].arr
