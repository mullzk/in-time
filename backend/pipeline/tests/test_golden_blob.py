from pathlib import Path

import pytest

from pipeline.schedule_blob import ScheduleDay, write_schedule_blob
from pipeline.tests.golden_blob import (
    GOLDEN_BLOB_PATH,
    GOLDEN_BUS_BLOB_PATH,
    build_golden_bus_day,
    build_golden_day,
)

_STALE_HINT = (
    "golden fixture is stale; run "
    "`python -m pipeline.tests.golden_blob` to regenerate it."
)


@pytest.mark.parametrize(
    ("path", "day", "flags"),
    [
        (GOLDEN_BLOB_PATH, build_golden_day(), 1),
        (GOLDEN_BUS_BLOB_PATH, build_golden_bus_day(), 0),
    ],
)
def test_committed_golden_blob_matches_the_writer(
    path: Path, day: ScheduleDay, flags: int
) -> None:
    assert path.read_bytes() == write_schedule_blob(day, flags=flags), _STALE_HINT
