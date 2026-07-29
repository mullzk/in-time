import datetime

from pipeline.diagnostics import DayDiagnostics
from pipeline.schedule_blob import ScheduleDay, Trip
from pipeline.schedule_day import DayBuilds, NamedStraightFallback, ScheduleBuild


def make_build(
    trips: int,
    stations: int,
    edges: int,
    method_counts: dict[str, int],
    straight_fallbacks: list[NamedStraightFallback],
) -> ScheduleBuild:
    day = ScheduleDay(
        service_date=datetime.date(2026, 7, 16),
        stations=[(0.0, 0.0)] * stations,
        edges=[[(0.0, 0.0)]] * edges,
        trips=[Trip(category=1, events=[]) for _ in range(trips)],
    )
    return ScheduleBuild(day, [], method_counts, straight_fallbacks)


def make_diagnostics() -> DayDiagnostics:
    rail = make_build(
        trips=300,
        stations=120,
        edges=90,
        method_counts={"direct": 700, "multi_snap": 200, "straight": 100},
        straight_fallbacks=[
            NamedStraightFallback("Aarau", "Zofingen", 12.5),
            NamedStraightFallback("Baden", "Brugg", 7.0),
        ],
    )
    road = make_build(50, 40, 0, {}, [])
    return DayDiagnostics(
        service_date=datetime.date(2026, 7, 16),
        builds=DayBuilds(rail=rail, road=road),
        inputs_seconds=3.2,
        build_seconds=8.7,
        rail_blob_bytes=2_500_000,
        road_blob_bytes=800_000,
    )


def test_lines_report_trip_and_station_counts_for_both_modes() -> None:
    lines = make_diagnostics().lines()

    assert "rail trips:         300" in lines
    assert "road trips:         50" in lines
    assert "rail stations:      120" in lines
    assert "road stations:      40" in lines
    assert "rail edges:         90" in lines


def test_lines_break_down_routing_methods_with_shares() -> None:
    lines = make_diagnostics().lines()

    assert "routing methods (rail):" in lines
    assert "  direct          700 (70.00%)" in lines
    assert "  multi_snap      200 (20.00%)" in lines
    assert "  recover           0 (0.00%)" in lines
    assert "  straight        100 (10.00%)" in lines


def test_lines_list_straight_fallbacks_by_distance() -> None:
    lines = make_diagnostics().lines()

    assert "straight-line fallbacks: 2 (by distance)" in lines
    assert "  Aarau -> Zofingen  12.5 km" in lines
    assert "  Baden -> Brugg  7.0 km" in lines


def test_routing_shares_are_zero_without_any_legs() -> None:
    rail = make_build(0, 0, 0, {}, [])
    road = make_build(0, 0, 0, {}, [])
    diagnostics = DayDiagnostics(
        service_date=datetime.date(2026, 7, 16),
        builds=DayBuilds(rail=rail, road=road),
        inputs_seconds=0.0,
        build_seconds=0.0,
        rail_blob_bytes=0,
        road_blob_bytes=0,
    )

    lines = diagnostics.lines()

    assert "  direct            0 (0.00%)" in lines
    assert "straight-line fallbacks: 0 (by distance)" in lines
