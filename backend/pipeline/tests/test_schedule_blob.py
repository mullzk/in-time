import datetime

from pipeline.schedule_blob import (
    FLAG_RAIL_ONLY,
    HEADER_SIZE,
    LV95_ORIGIN_EAST,
    LV95_ORIGIN_NORTH,
    MAGIC,
    VERSION,
    Event,
    ScheduleDay,
    Trip,
    read_header,
    read_schedule_blob,
    write_schedule_blob,
)


def sample_day() -> ScheduleDay:
    # 3 stations, 2 shared edges, 1 trip with 3 stops / 2 legs.
    stations = [
        (2600000.0, 1200000.0),  # A
        (2610000.0, 1200000.0),  # B
        (2620000.0, 1205000.0),  # C
    ]
    edges = [
        [(2600000.0, 1200000.0), (2605000.0, 1200000.0), (2610000.0, 1200000.0)],
        [(2610000.0, 1200000.0), (2620000.0, 1205000.0)],
    ]
    trip = Trip(
        category=3,
        events=[
            Event(station=0, arr=28800, dep=28860, leg_edges=[1]),
            Event(station=1, arr=29400, dep=29460, leg_edges=[2]),
            Event(station=2, arr=30000, dep=30000, leg_edges=[]),
        ],
    )
    return ScheduleDay(
        service_date=datetime.date(2026, 7, 16),
        stations=stations,
        edges=edges,
        trips=[trip],
    )


def test_round_trip_reconstructs_structure() -> None:
    day = sample_day()
    restored = read_schedule_blob(write_schedule_blob(day))

    assert restored.service_date == day.service_date
    assert restored.stations == day.stations
    assert restored.edges == day.edges
    assert restored.trips == day.trips


def test_header_invariants() -> None:
    day = sample_day()
    blob = write_schedule_blob(day)
    header = read_header(blob)

    assert blob[:4] == MAGIC
    assert header.version == VERSION
    assert header.flags & FLAG_RAIL_ONLY
    assert header.service_date == 20260716
    assert header.station_count == 3
    assert header.edge_count == 2
    assert header.point_count == 5
    assert header.trip_count == 1
    assert header.event_count == 3
    assert header.path_count == 2

    offsets = [
        header.offset_stations,
        header.offset_edges,
        header.offset_points,
        header.offset_trips,
        header.offset_events,
        header.offset_path,
    ]
    assert offsets[0] == HEADER_SIZE
    assert offsets == sorted(offsets)
    assert all(offset % 4 == 0 for offset in offsets)


def test_determinism_same_input_same_bytes() -> None:
    assert write_schedule_blob(sample_day()) == write_schedule_blob(sample_day())


def test_little_endian_header() -> None:
    blob = write_schedule_blob(sample_day())
    # version is a uint16 at byte offset 4; little-endian => low byte first.
    assert blob[4] == VERSION
    assert blob[5] == 0


def test_coordinates_round_trip_within_half_metre() -> None:
    day = sample_day()
    # Zürich HB in LV95, sub-metre fractions that meter-quantisation drops.
    day.stations[0] = (2683412.4, 1247985.6)
    day.edges[0][0] = (2683412.4, 1247985.6)
    restored = read_schedule_blob(write_schedule_blob(day))

    east, north = restored.stations[0]
    assert abs(east - 2683412.4) <= 0.5
    assert abs(north - 1247985.6) <= 0.5


def test_origin_offsets_are_non_negative() -> None:
    day = sample_day()
    blob = write_schedule_blob(day)
    header = read_header(blob)
    assert header.coord_origin_east == LV95_ORIGIN_EAST
    assert header.coord_origin_north == LV95_ORIGIN_NORTH
    # Every station sits north-east of the origin.
    for east, north in day.stations:
        assert east >= LV95_ORIGIN_EAST
        assert north >= LV95_ORIGIN_NORTH


def test_category_in_rail_range() -> None:
    day = sample_day()
    for trip in day.trips:
        assert 0 <= trip.category <= 4


def test_path_and_event_counts_are_consistent() -> None:
    day = sample_day()
    restored = read_schedule_blob(write_schedule_blob(day))
    header = read_header(write_schedule_blob(day))

    total_events = sum(len(trip.events) for trip in restored.trips)
    total_path = sum(
        len(event.leg_edges) for trip in restored.trips for event in trip.events
    )
    assert total_events == header.event_count
    assert total_path == header.path_count

    for trip in restored.trips:
        # Only the last stop of a trip has no outgoing leg.
        for event in trip.events[:-1]:
            assert event.leg_edges
        assert trip.events[-1].leg_edges == []


def test_path_indices_are_signed_one_based_and_in_range() -> None:
    day = sample_day()
    restored = read_schedule_blob(write_schedule_blob(day))
    edge_count = len(restored.edges)
    for trip in restored.trips:
        for event in trip.events:
            for signed in event.leg_edges:
                assert signed != 0
                assert 0 <= abs(signed) - 1 < edge_count
