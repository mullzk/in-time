from pathlib import Path

import pytest

from pipeline.schedule_blob import NetworkType, ScheduleDay, create_schedule_blob
from pipeline.tests.golden_blob import (
    GOLDEN_BUS_BLOB_PATH,
    GOLDEN_RAIL_BLOB_PATH,
    build_golden_bus_day,
    build_golden_rail_day,
)

_STALE_HINT = (
    "golden fixture is stale; run "
    "`python -m pipeline.tests.golden_blob` to regenerate it."
)


@pytest.mark.parametrize(
    ("path", "day", "network_type"),
    [
        (GOLDEN_RAIL_BLOB_PATH, build_golden_rail_day(), NetworkType.RAIL),
        (GOLDEN_BUS_BLOB_PATH, build_golden_bus_day(), NetworkType.BUS),
    ],
)
def test_committed_golden_blob_matches_the_writer(
    path: Path, day: ScheduleDay, network_type: NetworkType
) -> None:
    assert path.read_bytes() == create_schedule_blob(day, network_type), _STALE_HINT
