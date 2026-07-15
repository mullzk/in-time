from collections.abc import Callable
from datetime import date
from pathlib import Path

from django.utils import timezone

from pipeline.datadir import DataDir
from pipeline.models import BuildCommand, BuildRun, BuildStatus


def run_build_schedule(
    data_dir: DataDir,
    service_date: date,
    fetch_gtfs: Callable[[], str],
    build_day: Callable[[date, Path], None],
    reload_service: Callable[[], None],
) -> BuildRun:
    version = fetch_gtfs()
    if _already_current(data_dir, service_date, version):
        return BuildRun.objects.create(
            command=BuildCommand.SCHEDULE,
            service_date=service_date,
            source_version=version,
            status=BuildStatus.SKIPPED,
            finished_at=timezone.now(),
            message="already current",
        )

    run = BuildRun.objects.create(
        command=BuildCommand.SCHEDULE,
        service_date=service_date,
        source_version=version,
        status=BuildStatus.RUNNING,
    )
    try:
        artifact_dir = data_dir.artifact_dir(service_date)
        build_day(service_date, artifact_dir)
        data_dir.publish(service_date)
        reload_service()
    except Exception as error:
        run.status = BuildStatus.FAILED
        run.message = str(error)
        run.finished_at = timezone.now()
        run.save()
        raise

    run.status = BuildStatus.SUCCESS
    run.artifact_path = str(artifact_dir)
    run.finished_at = timezone.now()
    run.save()
    return run


def _already_current(data_dir: DataDir, service_date: date, version: str) -> bool:
    done = BuildRun.objects.filter(
        command=BuildCommand.SCHEDULE,
        service_date=service_date,
        source_version=version,
        status=BuildStatus.SUCCESS,
    ).exists()
    return done and data_dir.current_target_name() == service_date.isoformat()
