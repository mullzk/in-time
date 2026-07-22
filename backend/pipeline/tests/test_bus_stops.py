import os
from pathlib import Path

import pytest

from pipeline.bus_stops import load_bus_stops

GTFS_DIR = os.environ.get("GTFS_SCHEDULE_DIR")

STOPS_HEADER = (
    "stop_id,stop_name,stop_lat,stop_lon,location_type,parent_station,"
    "platform_code,original_stop_id,didok\n"
)

# WGS84 of the swisstopo fundamental point -> LV95 2600000 / 1200000.
BERN_LAT = 46.951082958
BERN_LON = 7.438632495


def write_stops(directory: Path, rows: str) -> None:
    directory.mkdir(parents=True, exist_ok=True)
    (directory / "stops.txt").write_text(STOPS_HEADER + rows, encoding="utf-8")


def test_platforms_collapse_to_one_station_per_bpuic(tmp_path: Path) -> None:
    write_stops(
        tmp_path,
        f'"Parent8500001","Bern","{BERN_LAT}","{BERN_LON}","1","","","","8500001"\n'
        f'"ch:1:sloid:1","Bern","{BERN_LAT}","{BERN_LON}","","Parent8500001","",'
        '"","8500001"\n'
        '"ch:1:sloid:1:2:3","Bern","47.0","7.5","","Parent8500001","3","","8500001"\n',
    )
    stops = load_bus_stops(tmp_path)
    assert set(stops) == {8500001}
    assert stops[8500001].name == "Bern"


def test_station_row_is_preferred_over_platform_rows(tmp_path: Path) -> None:
    # The platform row carries deliberately wrong coordinates; the station-level
    # (location_type=1) row must win.
    write_stops(
        tmp_path,
        '"ch:1:sloid:1:2:3","Bern","48.0","6.0","","Parent8500001","3","","8500001"\n'
        f'"Parent8500001","Bern","{BERN_LAT}","{BERN_LON}","1","","","","8500001"\n',
    )
    east, north = load_bus_stops(tmp_path)[8500001].location
    assert abs(east - 2600000) < 5
    assert abs(north - 1200000) < 5


def test_wgs84_is_reprojected_to_lv95(tmp_path: Path) -> None:
    write_stops(
        tmp_path,
        f'"Parent8500001","Bern","{BERN_LAT}","{BERN_LON}","1","","","","8500001"\n',
    )
    east, north = load_bus_stops(tmp_path)[8500001].location
    assert abs(east - 2600000) < 5
    assert abs(north - 1200000) < 5


@pytest.mark.realdata
@pytest.mark.skipif(not GTFS_DIR, reason="set GTFS_SCHEDULE_DIR to a GTFS feed")
def test_real_bus_stops_are_plausible() -> None:
    assert GTFS_DIR is not None
    stops = load_bus_stops(Path(GTFS_DIR))

    assert len(stops) > 20_000
    assert all(str(bpuic).startswith("85") for bpuic in stops)
    for stop in stops.values():
        east, north = stop.location
        assert 2_480_000 < east < 2_840_000
        assert 1_070_000 < north < 1_300_000


def test_foreign_stops_are_dropped(tmp_path: Path) -> None:
    write_stops(
        tmp_path,
        f'"Parent8500001","Bern","{BERN_LAT}","{BERN_LON}","1","","","","8500001"\n'
        '"Parent8002140","Augsburg Hbf","48.365","10.885","1","","","","8002140"\n'
        '"Parent7104307","Figueras","42.264","2.943","1","","","","7104307"\n',
    )
    assert set(load_bus_stops(tmp_path)) == {8500001}


def test_non_numeric_didok_is_dropped(tmp_path: Path) -> None:
    write_stops(
        tmp_path,
        f'"Parent8500001","Bern","{BERN_LAT}","{BERN_LON}","1","","","","8500001"\n'
        '"foreign:x","No DiDok","48.0","7.0","1","","","",""\n',
    )
    assert set(load_bus_stops(tmp_path)) == {8500001}


def test_falls_back_to_empty_platform_row_without_a_station_row(tmp_path: Path) -> None:
    # No location_type=1 row: the row without a platform_code is the station-level
    # representative and must be chosen over the platform row.
    write_stops(
        tmp_path,
        f'"ch:1:sloid:1","Bern","{BERN_LAT}","{BERN_LON}","","Parent8500001","",'
        '"","8500001"\n'
        '"ch:1:sloid:1:2:3","Bern","48.0","6.0","","Parent8500001","3","","8500001"\n',
    )
    east, north = load_bus_stops(tmp_path)[8500001].location
    assert abs(east - 2600000) < 5
    assert abs(north - 1200000) < 5
