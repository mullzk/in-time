import datetime
from pathlib import Path

from pipeline.network.rail import RailGraph
from pipeline.schedule_day import build_schedule_day

THURSDAY = datetime.date(2026, 7, 16)

A = (2600000.0, 1200000.0)
B = (2610000.0, 1200000.0)
C = (2620000.0, 1200000.0)


def line_rail_graph() -> RailGraph:
    return RailGraph.from_rail_segments(
        nodes={"na": A, "nb": B, "nc": C},
        segments=[("na", "nb", [A, B]), ("nb", "nc", [B, C])],
        station_to_node={1: "na", 2: "nb", 3: "nc"},
        node_name={"na": "Alpha", "nb": "Beta", "nc": "Gamma"},
    )


def write_gtfs(directory: Path) -> None:
    directory.mkdir(parents=True, exist_ok=True)
    (directory / "calendar.txt").write_text(
        "service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,"
        "start_date,end_date\nWD,1,1,1,1,1,0,0,20260101,20261231\n"
    )
    (directory / "routes.txt").write_text(
        "route_id,agency_id,route_short_name,route_long_name,route_desc,route_type\n"
        "R,,IR,,,103\n"
    )
    (directory / "trips.txt").write_text("route_id,service_id,trip_id\nR,WD,T1\n")
    (directory / "stops.txt").write_text(
        "stop_id,stop_name,stop_lat,stop_lon,didok\n"
        "1,Alpha,46.9,7.4,1\n2,Beta,46.9,7.5,2\n3,Gamma,46.9,7.6,3\n"
    )
    (directory / "stop_times.txt").write_text(
        "trip_id,arrival_time,departure_time,stop_id,stop_sequence\n"
        "T1,08:00:00,08:00:30,1,1\n"
        "T1,08:05:00,08:05:30,2,2\n"
        "T1,08:10:00,08:10:00,3,3\n"
    )


def test_build_schedule_day_assembles_trip(tmp_path: Path) -> None:
    write_gtfs(tmp_path)
    build = build_schedule_day(tmp_path, line_rail_graph(), THURSDAY)

    assert build.day.service_date == THURSDAY
    assert len(build.day.trips) == 1
    trip = build.day.trips[0]
    assert trip.category == 1  # IR

    assert [event.station for event in trip.events] == [0, 1, 2]
    assert [event.arr for event in trip.events] == [28800, 29100, 29400]
    # Every stop but the last carries an outgoing routed leg.
    assert trip.events[0].leg_edges and trip.events[1].leg_edges
    assert trip.events[2].leg_edges == []

    assert build.day.stations == [A, B, C]
    assert [station.name for station in build.stations] == ["Alpha", "Beta", "Gamma"]
    assert build.method_counts["direct"] == 2
    assert build.straight_fallbacks == []
