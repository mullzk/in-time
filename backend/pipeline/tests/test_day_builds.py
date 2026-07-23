import datetime
from pathlib import Path

from pipeline.bus_stops import BusStop
from pipeline.frequency import (
    FREQUENCY_MODE_BUS,
    FREQUENCY_MODE_RAIL,
    FREQUENCY_MODE_TRAM,
    RegularEdges,
)
from pipeline.network.rail import RailGraph
from pipeline.schedule_blob import FLAG_BAV_ONLY, read_header, write_schedule_blob
from pipeline.schedule_day import build_day_builds

THURSDAY = datetime.date(2026, 7, 16)

RAIL_A, RAIL_B = 8500001, 8500002
TRAM_A, TRAM_B = 8500010, 8500011
BUS_A, BUS_B = 8500020, 8500021

PA, PB = (2600000.0, 1200000.0), (2610000.0, 1200000.0)
PT1, PT2 = (2620000.0, 1200000.0), (2621000.0, 1200000.0)
BUS_PA, BUS_PB = (2630000.0, 1200000.0), (2631000.0, 1200000.0)


def bav_graph() -> RailGraph:
    return RailGraph.from_rail_segments(
        nodes={"na": PA, "nb": PB, "nt1": PT1, "nt2": PT2},
        segments=[("na", "nb", [PA, PB]), ("nt1", "nt2", [PT1, PT2])],
        station_to_node={RAIL_A: "na", RAIL_B: "nb", TRAM_A: "nt1", TRAM_B: "nt2"},
        node_name={"na": "RailA", "nb": "RailB", "nt1": "TramA", "nt2": "TramB"},
    )


def bus_stops() -> dict[int, BusStop]:
    return {
        BUS_A: BusStop(BUS_A, BUS_PA, "BusA"),
        BUS_B: BusStop(BUS_B, BUS_PB, "BusB"),
    }


def regular_edges() -> RegularEdges:
    return RegularEdges(
        frozenset(
            {
                (RAIL_A, RAIL_B, FREQUENCY_MODE_RAIL),
                (TRAM_A, TRAM_B, FREQUENCY_MODE_TRAM),
                (BUS_A, BUS_B, FREQUENCY_MODE_BUS),
            }
        )
    )


def write_feed(directory: Path) -> None:
    directory.mkdir(parents=True, exist_ok=True)
    (directory / "calendar.txt").write_text(
        "service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,"
        "start_date,end_date\nWD,1,1,1,1,1,0,0,20260101,20261231\n"
    )
    (directory / "routes.txt").write_text(
        "route_id,agency_id,route_short_name,route_long_name,route_desc,route_type\n"
        "R_IR,,IR,,,103\nR_TRAM,,T,,,900\nR_BUS,,B,,,700\n"
    )
    (directory / "trips.txt").write_text(
        "route_id,service_id,trip_id\n"
        "R_IR,WD,T_RAIL\nR_TRAM,WD,T_TRAM\nR_BUS,WD,T_BUS\n"
    )
    (directory / "stops.txt").write_text(
        "stop_id,stop_name,stop_lat,stop_lon,didok\n"
        + "".join(
            f"{bpuic},S{bpuic},46.9,7.4,{bpuic}\n"
            for bpuic in (RAIL_A, RAIL_B, TRAM_A, TRAM_B, BUS_A, BUS_B)
        )
    )
    (directory / "stop_times.txt").write_text(
        "trip_id,arrival_time,departure_time,stop_id,stop_sequence\n"
        f"T_RAIL,08:00:00,08:00:30,{RAIL_A},1\n"
        f"T_RAIL,08:20:00,08:20:00,{RAIL_B},2\n"
        f"T_TRAM,09:00:00,09:00:30,{TRAM_A},1\n"
        f"T_TRAM,09:05:00,09:05:00,{TRAM_B},2\n"
        f"T_BUS,10:00:00,10:00:30,{BUS_A},1\n"
        f"T_BUS,10:05:00,10:05:00,{BUS_B},2\n"
    )


def test_bav_carries_rail_and_tram_road_carries_bus(tmp_path: Path) -> None:
    write_feed(tmp_path)
    builds = build_day_builds(
        tmp_path, bav_graph(), bus_stops(), regular_edges(), THURSDAY
    )

    assert sorted(trip.category for trip in builds.bav.day.trips) == [1, 5]
    assert [trip.category for trip in builds.road.day.trips] == [6]


def test_bus_build_is_geometry_free(tmp_path: Path) -> None:
    write_feed(tmp_path)
    builds = build_day_builds(
        tmp_path, bav_graph(), bus_stops(), regular_edges(), THURSDAY
    )

    # Bus legs are drawn straight between stations, so the blob carries no edges.
    assert builds.road.day.edges == []
    bus_trip = builds.road.day.trips[0]
    assert all(event.leg_edges == [] for event in bus_trip.events)
    assert builds.road.day.stations == [BUS_PA, BUS_PB]


RAIL_C, BUS_C = 8500003, 8500022
PC = (2611000.0, 1200000.0)
BUS_PC = (2632000.0, 1200000.0)


def mixed_graph() -> RailGraph:
    return RailGraph.from_rail_segments(
        nodes={"na": PA, "nb": PB, "nc": PC},
        segments=[("na", "nb", [PA, PB]), ("nb", "nc", [PB, PC])],
        station_to_node={RAIL_A: "na", RAIL_B: "nb", RAIL_C: "nc"},
        node_name={"na": "RailA", "nb": "RailB", "nc": "RailC"},
    )


def mixed_bus_stops() -> dict[int, BusStop]:
    return {
        BUS_A: BusStop(BUS_A, BUS_PA, "BusA"),
        BUS_B: BusStop(BUS_B, BUS_PB, "BusB"),
        BUS_C: BusStop(BUS_C, BUS_PC, "BusC"),
    }


# A-B is regular for both modes; B-C is served by neither.
def mixed_regular_edges() -> RegularEdges:
    return RegularEdges(
        frozenset(
            {
                (RAIL_A, RAIL_B, FREQUENCY_MODE_RAIL),
                (BUS_A, BUS_B, FREQUENCY_MODE_BUS),
            }
        )
    )


def write_three_stop_feed(directory: Path) -> None:
    directory.mkdir(parents=True, exist_ok=True)
    (directory / "calendar.txt").write_text(
        "service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,"
        "start_date,end_date\nWD,1,1,1,1,1,0,0,20260101,20261231\n"
    )
    (directory / "routes.txt").write_text(
        "route_id,agency_id,route_short_name,route_long_name,route_desc,route_type\n"
        "R_IR,,IR,,,103\nR_BUS,,B,,,700\n"
    )
    (directory / "trips.txt").write_text(
        "route_id,service_id,trip_id\nR_IR,WD,T_RAIL\nR_BUS,WD,T_BUS\n"
    )
    (directory / "stops.txt").write_text(
        "stop_id,stop_name,stop_lat,stop_lon,didok\n"
        + "".join(
            f"{bpuic},S{bpuic},46.9,7.4,{bpuic}\n"
            for bpuic in (RAIL_A, RAIL_B, RAIL_C, BUS_A, BUS_B, BUS_C)
        )
    )
    (directory / "stop_times.txt").write_text(
        "trip_id,arrival_time,departure_time,stop_id,stop_sequence\n"
        f"T_RAIL,08:00:00,08:00:30,{RAIL_A},1\n"
        f"T_RAIL,08:05:00,08:05:30,{RAIL_B},2\n"
        f"T_RAIL,08:10:00,08:10:00,{RAIL_C},3\n"
        f"T_BUS,10:00:00,10:00:30,{BUS_A},1\n"
        f"T_BUS,10:05:00,10:05:30,{BUS_B},2\n"
        f"T_BUS,10:10:00,10:10:00,{BUS_C},3\n"
    )


def test_bus_survives_an_irregular_edge_but_rail_does_not(tmp_path: Path) -> None:
    write_three_stop_feed(tmp_path)
    builds = build_day_builds(
        tmp_path, mixed_graph(), mixed_bus_stops(), mixed_regular_edges(), THURSDAY
    )

    # The bus keeps all three stops though its B-C edge is irregular.
    assert [len(trip.events) for trip in builds.road.day.trips] == [3]
    # The rail trip still drops whole on the same kind of irregular edge.
    assert builds.bav.day.trips == []


def test_bus_with_no_regular_edge_is_dropped(tmp_path: Path) -> None:
    write_three_stop_feed(tmp_path)
    rail_only = RegularEdges(frozenset({(RAIL_A, RAIL_B, FREQUENCY_MODE_RAIL)}))
    builds = build_day_builds(
        tmp_path, mixed_graph(), mixed_bus_stops(), rail_only, THURSDAY
    )

    # No regular bus edge covers this feed -> nothing to keep.
    assert builds.road.day.trips == []


def test_each_blob_round_trips_with_its_flag(tmp_path: Path) -> None:
    write_feed(tmp_path)
    builds = build_day_builds(
        tmp_path, bav_graph(), bus_stops(), regular_edges(), THURSDAY
    )

    bav_blob = write_schedule_blob(builds.bav.day, FLAG_BAV_ONLY)
    road_blob = write_schedule_blob(builds.road.day, 0)

    assert read_header(bav_blob).flags & FLAG_BAV_ONLY
    assert not (read_header(road_blob).flags & FLAG_BAV_ONLY)
    assert read_header(road_blob).trip_count == 1
    assert read_header(road_blob).edge_count == 0
