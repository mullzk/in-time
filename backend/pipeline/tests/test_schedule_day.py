import datetime
from pathlib import Path

from pipeline.frequency import FREQUENCY_MODE_RAIL, RegularEdges
from pipeline.network.rail import RailGraph
from pipeline.schedule_blob import read_schedule_blob, write_schedule_blob
from pipeline.schedule_day import build_schedule_day

THURSDAY = datetime.date(2026, 7, 16)

A = (2600000.0, 1200000.0)
B = (2610000.0, 1200000.0)
C = (2620000.0, 1200000.0)

ALPHA, BETA, GAMMA = 8500001, 8500002, 8500003


def line_rail_graph() -> RailGraph:
    return RailGraph.from_rail_segments(
        nodes={"na": A, "nb": B, "nc": C},
        segments=[("na", "nb", [A, B]), ("nb", "nc", [B, C])],
        station_to_node={ALPHA: "na", BETA: "nb", GAMMA: "nc"},
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
        f"{ALPHA},Alpha,46.9,7.4,{ALPHA}\n"
        f"{BETA},Beta,46.9,7.5,{BETA}\n"
        f"{GAMMA},Gamma,46.9,7.6,{GAMMA}\n"
    )
    (directory / "stop_times.txt").write_text(
        "trip_id,arrival_time,departure_time,stop_id,stop_sequence\n"
        f"T1,08:00:00,08:00:30,{ALPHA},1\n"
        f"T1,08:05:00,08:05:30,{BETA},2\n"
        f"T1,08:10:00,08:10:00,{GAMMA},3\n"
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


def write_short_gtfs(directory: Path) -> None:
    # Same line, but the trip only runs Alpha -> Beta, so the Beta-Gamma edge is
    # never travelled.
    write_gtfs(directory)
    (directory / "stop_times.txt").write_text(
        "trip_id,arrival_time,departure_time,stop_id,stop_sequence\n"
        f"T1,08:00:00,08:00:30,{ALPHA},1\n"
        f"T1,08:20:00,08:20:00,{BETA},2\n"
    )


def test_only_travelled_edges_are_emitted_and_reindexed(tmp_path: Path) -> None:
    write_short_gtfs(tmp_path)
    build = build_schedule_day(tmp_path, line_rail_graph(), THURSDAY)

    trip = build.day.trips[0]
    referenced = {abs(edge) for event in trip.events for edge in event.leg_edges}
    # Every emitted edge is travelled, and the indices are a gapless 1..N.
    assert referenced == set(range(1, len(build.day.edges) + 1))
    # The blob round-trips with the pruned, reindexed geometry intact.
    restored = read_schedule_blob(write_schedule_blob(build.day))
    assert restored.edges == build.day.edges


def test_frequency_filter_drops_trip_with_an_irregular_edge(tmp_path: Path) -> None:
    write_gtfs(tmp_path)
    # Alpha-Beta is regular but Beta-Gamma is not, so the trip is dropped whole.
    regular = RegularEdges(frozenset({(ALPHA, BETA, FREQUENCY_MODE_RAIL)}))
    build = build_schedule_day(tmp_path, line_rail_graph(), THURSDAY, regular)

    assert build.day.trips == []


def test_frequency_filter_keeps_a_fully_regular_trip(tmp_path: Path) -> None:
    write_gtfs(tmp_path)
    regular = RegularEdges(
        frozenset(
            {
                (ALPHA, BETA, FREQUENCY_MODE_RAIL),
                (BETA, GAMMA, FREQUENCY_MODE_RAIL),
            }
        )
    )
    build = build_schedule_day(tmp_path, line_rail_graph(), THURSDAY, regular)

    assert len(build.day.trips) == 1
