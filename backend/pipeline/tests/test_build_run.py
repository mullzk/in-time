import datetime

import pytest

from pipeline.models import BuildRun, BuildStatus


@pytest.mark.django_db
def test_new_run_defaults_to_running() -> None:
    run = BuildRun.objects.create(
        command="build_schedule", service_date=datetime.date(2026, 7, 16)
    )
    assert run.status == BuildStatus.RUNNING
    assert run.started_at is not None
    assert run.finished_at is None


@pytest.mark.django_db
def test_str_summarises_command_date_status() -> None:
    run = BuildRun.objects.create(
        command="build_schedule",
        service_date=datetime.date(2026, 7, 16),
        status=BuildStatus.SUCCESS,
    )
    assert str(run) == "build_schedule 2026-07-16 [success]"
