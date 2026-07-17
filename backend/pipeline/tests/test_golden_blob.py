from pipeline.schedule_blob import write_schedule_blob
from pipeline.tests.golden_blob import (
    GOLDEN_BLOB_PATH,
    build_golden_day,
)


def test_committed_golden_blob_matches_the_writer() -> None:
    expected = write_schedule_blob(build_golden_day())
    assert GOLDEN_BLOB_PATH.read_bytes() == expected, (
        "golden-day.itsb is stale; run "
        "`python -m pipeline.tests.golden_blob` to regenerate it."
    )
