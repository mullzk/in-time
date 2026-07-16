import os
import zipfile
from pathlib import Path

import pytest

from pipeline.fetch import (
    extract_zip_from_url,
    gtfs_version_from_final_url,
    resolve_gtfs_version,
    resolve_rail_network_version,
    sanitize_last_modified,
)

RUN_NETWORK = os.environ.get("RUN_NETWORK_FETCH")


def test_gtfs_version_from_final_url() -> None:
    url = (
        "https://cdn.example/dx-omd-prod/resources/abc/gtfs_fp2026_20260715.zip"
        "?response-content-disposition=attachment%3B%20filename%3D"
        "gtfs_fp2026_20260715.zip&X-Amz-Expires=60"
    )
    assert gtfs_version_from_final_url(url) == "20260715"


def test_sanitize_last_modified() -> None:
    assert sanitize_last_modified("Mon, 15 Sep 2025 07:12:05 GMT") == "20250915"


def test_extract_zip_from_url_reads_a_local_zip(tmp_path: Path) -> None:
    zip_path = tmp_path / "feed.zip"
    with zipfile.ZipFile(zip_path, "w") as archive:
        archive.writestr("feed_info.txt", "feed_version=x")
        archive.writestr("nested/stops.txt", "stop_id\n")

    dest = tmp_path / "out"
    extract_zip_from_url(zip_path.as_uri(), dest)

    assert (dest / "feed_info.txt").read_text() == "feed_version=x"
    assert (dest / "nested" / "stops.txt").exists()


@pytest.mark.realdata
@pytest.mark.skipif(not RUN_NETWORK, reason="set RUN_NETWORK_FETCH to hit live hosts")
def test_live_versions_resolve() -> None:
    gtfs_version = resolve_gtfs_version()
    rail_version = resolve_rail_network_version()
    assert gtfs_version.isdigit() and len(gtfs_version) == 8
    assert rail_version.isdigit() and len(rail_version) == 8
