import os
from pathlib import Path

import pytest

from pipeline.station_clusters import load_station_clusters

GTFS_DIR = os.environ.get("GTFS_SCHEDULE_DIR")

STOPS_HEADER = (
    "stop_id,stop_name,stop_lat,stop_lon,location_type,parent_station,"
    "platform_code,original_stop_id,didok\n"
)
TRANSFERS_HEADER = "from_stop_id,to_stop_id,transfer_type,min_transfer_time\n"


def write_feed(directory: Path, stops: str, transfers: str) -> None:
    directory.mkdir(parents=True, exist_ok=True)
    (directory / "stops.txt").write_text(STOPS_HEADER + stops, encoding="utf-8")
    (directory / "transfers.txt").write_text(
        TRANSFERS_HEADER + transfers, encoding="utf-8"
    )


def stop_row(stop_id: str, didok: str) -> str:
    return f'"{stop_id}","Bern","46.95","7.44","1","","","","{didok}"\n'


def test_a_transfer_clusters_two_stations(tmp_path: Path) -> None:
    write_feed(
        tmp_path,
        stop_row("rail", "8507000") + stop_row("bus", "8500001"),
        '"rail","bus","2","300"\n',
    )
    clusters = load_station_clusters(tmp_path)
    assert clusters == {8507000: 8500001, 8500001: 8500001}


def test_transfers_cluster_transitively(tmp_path: Path) -> None:
    write_feed(
        tmp_path,
        stop_row("a", "8507000") + stop_row("b", "8500001") + stop_row("c", "8576646"),
        '"a","b","2","300"\n"b","c","2","300"\n',
    )
    clusters = load_station_clusters(tmp_path)
    assert clusters == {8507000: 8500001, 8500001: 8500001, 8576646: 8500001}


def test_a_cluster_is_named_by_its_smallest_didok(tmp_path: Path) -> None:
    write_feed(
        tmp_path,
        stop_row("x", "8590001") + stop_row("y", "8580002"),
        '"x","y","2","0"\n',
    )
    assert set(load_station_clusters(tmp_path).values()) == {8580002}


def test_unlinked_stations_are_not_clustered(tmp_path: Path) -> None:
    write_feed(
        tmp_path,
        stop_row("rail", "8507000") + stop_row("far", "8500001"),
        "",
    )
    assert load_station_clusters(tmp_path) == {}


def test_platforms_sharing_a_didok_do_not_form_a_cluster(tmp_path: Path) -> None:
    write_feed(
        tmp_path,
        stop_row("ch:1:sloid:1", "8500001") + stop_row("ch:1:sloid:1:2:3", "8500001"),
        '"ch:1:sloid:1","ch:1:sloid:1:2:3","2","0"\n',
    )
    assert load_station_clusters(tmp_path) == {}


def test_a_transfer_to_a_foreign_stop_is_ignored(tmp_path: Path) -> None:
    write_feed(
        tmp_path,
        stop_row("rail", "8507000")
        + stop_row("bus", "8500001")
        + f'"foreign","Freiburg","48.0","7.8","1","","","","{"7001234"}"\n',
        '"rail","bus","2","0"\n"bus","foreign","2","0"\n',
    )
    assert load_station_clusters(tmp_path) == {8507000: 8500001, 8500001: 8500001}


def test_a_missing_transfers_file_yields_no_clusters(tmp_path: Path) -> None:
    tmp_path.mkdir(parents=True, exist_ok=True)
    (tmp_path / "stops.txt").write_text(
        STOPS_HEADER + stop_row("rail", "8507000"), encoding="utf-8"
    )
    assert load_station_clusters(tmp_path) == {}


@pytest.mark.realdata
@pytest.mark.skipif(not GTFS_DIR, reason="set GTFS_SCHEDULE_DIR to a GTFS feed")
def test_real_clusters_join_bern_across_modes() -> None:
    assert GTFS_DIR is not None
    clusters = load_station_clusters(Path(GTFS_DIR))
    # Bern rail (8507000) and the tram/bus stop "Bern, Bahnhof" (8576646) must
    # land in the same cluster, named by the smallest member didok.
    assert clusters[8507000] == clusters[8576646] == 8507000
    assert all(str(didok).startswith("85") for didok in clusters)
    assert len(clusters) > 100
