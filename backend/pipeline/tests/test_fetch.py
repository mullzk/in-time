import os
import zipfile
from pathlib import Path

import pytest

from pipeline.fetch import (
    extract_zip_from_url,
    gtfs_version_from_final_url,
    latest_road_network_version,
    resolve_gtfs_version,
    resolve_rail_network_version,
    resolve_road_network_version,
    road_network_asset_url,
    sanitize_last_modified,
)

RUN_NETWORK = os.environ.get("RUN_NETWORK_FETCH")

_STAC_ITEMS = {
    "type": "FeatureCollection",
    "features": [
        {
            "id": "swisstlm3d_2021-04",
            "assets": {
                "swisstlm3d_2021-04_2056_5728.gdb.zip": {"href": "https://x/a"},
                "swisstlm3d_2021-04_4326_5728.gdb.zip": {"href": "https://x/b"},
            },
        },
        {
            "id": "swisstlm3d_2022-03",
            "assets": {
                "swisstlm3d_2022-03_2056_5728.gdb.zip": {"href": "https://x/c"},
                "swisstlm3d_2022-03.xml": {"href": "https://x/d"},
            },
        },
        {
            "id": "swisstlm3d_2020-03",
            "assets": {
                "swisstlm3d_2020-03_2056_5728.gdb.zip": {"href": "https://x/e"},
            },
        },
    ],
}


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


def test_extract_zip_normalises_windows_separators(tmp_path: Path) -> None:
    # The swissTLM3D archive stores paths with backslashes; they must become a
    # real nested directory, not a flat file named "DIR.gdb\inner".
    zip_path = tmp_path / "gdb.zip"
    with zipfile.ZipFile(zip_path, "w") as archive:
        archive.writestr("SUB.gdb\\a0001.gdbtable", "content")

    dest = tmp_path / "out"
    extract_zip_from_url(zip_path.as_uri(), dest)

    assert (dest / "SUB.gdb" / "a0001.gdbtable").read_text() == "content"
    assert (dest / "SUB.gdb").is_dir()


def test_road_network_asset_url() -> None:
    assert road_network_asset_url("2022-03") == (
        "https://data.geo.admin.ch/ch.swisstopo.swisstlm3d/"
        "swisstlm3d_2022-03/swisstlm3d_2022-03_2056_5728.gdb.zip"
    )


def test_latest_road_network_version_picks_the_newest_2056_gdb() -> None:
    assert latest_road_network_version(_STAC_ITEMS) == "2022-03"


def test_latest_road_network_version_raises_without_a_2056_gdb() -> None:
    payload = {"features": [{"assets": {"swisstlm3d_2022-03.xml": {"href": "x"}}}]}
    with pytest.raises(ValueError, match="2056"):
        latest_road_network_version(payload)


@pytest.mark.realdata
@pytest.mark.skipif(not RUN_NETWORK, reason="set RUN_NETWORK_FETCH to hit live hosts")
def test_live_versions_resolve() -> None:
    gtfs_version = resolve_gtfs_version()
    rail_version = resolve_rail_network_version()
    road_version = resolve_road_network_version()
    assert gtfs_version.isdigit() and len(gtfs_version) == 8
    assert rail_version.isdigit() and len(rail_version) == 8
    assert len(road_version) == 7 and road_version[4] == "-"
