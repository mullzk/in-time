"""Deterministic golden schedule blobs shared by the Python writer guard and the
JavaScript VehiclePositionEngine tests — the cross-language format proof.

`golden-day.itsb` covers the routed (BAV) branch: geometry and times are chosen
so the reader's interpolation lands on round coordinates — a straight edge
traversed in reverse (leg 0) and a symmetric three-point bend traversed forward
(leg 1), each leg spanning 600 seconds. `golden-bus-day.itsb` covers the
straight-line branch: a bus blob carries no edges, so every leg has empty
`leg_edges` and is drawn as the straight line between its two stations.
"""

import datetime
from pathlib import Path

from pipeline.schedule_blob import Event, ScheduleDay, Trip, write_schedule_blob

_FIXTURES_DIR = (
    Path(__file__).resolve().parents[3] / "frontend" / "viz-core" / "fixtures"
)
GOLDEN_BLOB_PATH = _FIXTURES_DIR / "golden-day.itsb"
GOLDEN_BUS_BLOB_PATH = _FIXTURES_DIR / "golden-bus-day.itsb"


def build_golden_day() -> ScheduleDay:
    stations = [
        (2_600_000.0, 1_200_000.0),  # S0
        (2_610_000.0, 1_200_000.0),  # S1
        (2_610_000.0, 1_210_000.0),  # S2
    ]
    edges = [
        [(2_610_000.0, 1_200_000.0), (2_600_000.0, 1_200_000.0)],  # canonical S1->S0
        [
            (2_610_000.0, 1_200_000.0),
            (2_613_000.0, 1_205_000.0),
            (2_610_000.0, 1_210_000.0),
        ],  # canonical S1->S2, symmetric bend
    ]
    trips = [
        Trip(
            category=0,
            events=[
                Event(station=0, arr=36_000, dep=36_000, leg_edges=[-1]),
                Event(station=1, arr=36_600, dep=36_660, leg_edges=[2]),
                Event(station=2, arr=37_260, dep=37_260, leg_edges=[]),
            ],
        ),
        Trip(
            category=3,
            events=[
                Event(station=1, arr=40_000, dep=40_000, leg_edges=[2]),
                Event(station=2, arr=40_600, dep=40_600, leg_edges=[]),
            ],
        ),
    ]
    return ScheduleDay(
        service_date=datetime.date(2026, 7, 17),
        stations=stations,
        edges=edges,
        trips=trips,
    )


def build_golden_bus_day() -> ScheduleDay:
    stations = [
        (2_600_000.0, 1_200_000.0),  # S0
        (2_620_000.0, 1_200_000.0),  # S1
        (2_620_000.0, 1_220_000.0),  # S2
    ]
    trips = [
        Trip(
            category=6,
            events=[
                Event(station=0, arr=36_000, dep=36_000, leg_edges=[]),
                Event(station=1, arr=36_600, dep=36_660, leg_edges=[]),
                Event(station=2, arr=37_260, dep=37_260, leg_edges=[]),
            ],
        ),
    ]
    return ScheduleDay(
        service_date=datetime.date(2026, 7, 17),
        stations=stations,
        edges=[],
        trips=trips,
    )


def write_golden_blobs() -> None:
    _FIXTURES_DIR.mkdir(parents=True, exist_ok=True)
    GOLDEN_BLOB_PATH.write_bytes(write_schedule_blob(build_golden_day()))
    GOLDEN_BUS_BLOB_PATH.write_bytes(
        write_schedule_blob(build_golden_bus_day(), flags=0)
    )


if __name__ == "__main__":
    write_golden_blobs()
