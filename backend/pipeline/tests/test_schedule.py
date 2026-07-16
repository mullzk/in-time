import datetime
from collections.abc import Callable
from pathlib import Path

import pytest

from pipeline.datadir import DataDir
from pipeline.gtfs_archive import GtfsArchive
from pipeline.models import BuildRun, BuildStatus
from pipeline.schedule import run_build_schedule

DAY = datetime.date(2026, 7, 16)
NEXT_DAY = datetime.date(2026, 7, 17)


def make_builder(
    recorder: list[datetime.date] | None = None,
) -> Callable[[datetime.date, Path], None]:
    def build_day(service_date: datetime.date, dest: Path) -> None:
        dest.mkdir(parents=True, exist_ok=True)
        (dest / "schedule.itsb").write_bytes(b"ITSB")
        (dest / "stations.json").write_text("{}")
        if recorder is not None:
            recorder.append(service_date)

    return build_day


def const_fetch(version: str) -> Callable[[], str]:
    def fetch() -> str:
        return version

    return fetch


@pytest.mark.django_db
def test_first_run_builds_publishes_and_reloads(tmp_path: Path) -> None:
    data = DataDir(tmp_path)
    reloads: list[int] = []

    run = run_build_schedule(
        data,
        DAY,
        fetch_gtfs=const_fetch("v1"),
        build_day=make_builder(),
        reload_service=lambda: reloads.append(1),
    )

    assert run.status == BuildStatus.SUCCESS
    assert data.current_target_name() == "2026-07-16"
    assert (data.artifacts / "2026-07-16" / "schedule.itsb").exists()
    assert reloads == [1]


@pytest.mark.django_db
def test_skip_when_same_version_already_current(tmp_path: Path) -> None:
    data = DataDir(tmp_path)
    run_build_schedule(data, DAY, const_fetch("v1"), make_builder(), lambda: None)

    builds: list[datetime.date] = []
    reloads: list[int] = []
    second = run_build_schedule(
        data,
        DAY,
        const_fetch("v1"),
        make_builder(builds),
        lambda: reloads.append(1),
    )

    assert second.status == BuildStatus.SKIPPED
    assert builds == []
    assert reloads == []
    assert data.current_target_name() == "2026-07-16"


@pytest.mark.django_db
def test_failed_build_keeps_previous_current(tmp_path: Path) -> None:
    data = DataDir(tmp_path)
    run_build_schedule(data, DAY, const_fetch("v1"), make_builder(), lambda: None)

    def boom(service_date: datetime.date, dest: Path) -> None:
        raise RuntimeError("build failed")

    reloads: list[int] = []
    with pytest.raises(RuntimeError):
        run_build_schedule(
            data, NEXT_DAY, const_fetch("v2"), boom, lambda: reloads.append(1)
        )

    assert data.current_target_name() == "2026-07-16"
    assert reloads == []
    assert BuildRun.objects.filter(status=BuildStatus.FAILED).count() == 1


@pytest.mark.django_db
def test_previous_artifact_dir_deleted_after_swap(tmp_path: Path) -> None:
    data = DataDir(tmp_path)
    run_build_schedule(data, DAY, const_fetch("v1"), make_builder(), lambda: None)
    run_build_schedule(data, NEXT_DAY, const_fetch("v2"), make_builder(), lambda: None)

    assert not (data.artifacts / "2026-07-16").exists()
    assert (data.artifacts / "2026-07-17").exists()
    assert data.current_target_name() == "2026-07-17"


def test_gtfs_archive_skips_download_when_version_present(tmp_path: Path) -> None:
    downloads: list[str] = []

    def resolve() -> str:
        return "fp2026-07-02"

    def download(version: str, dest: Path) -> None:
        downloads.append(version)
        (dest / "feed_info.txt").write_text(f"version={version}")

    archive = GtfsArchive(tmp_path / "gtfs" / "archive", resolve, download)

    assert archive.ensure() == "fp2026-07-02"
    assert downloads == ["fp2026-07-02"]
    assert (tmp_path / "gtfs" / "archive" / "fp2026-07-02" / "feed_info.txt").exists()

    assert archive.ensure() == "fp2026-07-02"
    assert downloads == ["fp2026-07-02"]
