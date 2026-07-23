import os
from pathlib import Path

import pytest

from pipeline.network.road_gdb import build_road_graph, load_road_graph

# LV95 metres.
A = (2600000.0, 1200000.0)
B = (2600100.0, 1200000.0)
C = (2600200.0, 1200000.0)

ROAD_GDB = os.environ.get("ROAD_NETWORK_GDB")


def test_only_drivable_roads_are_kept() -> None:
    graph = build_road_graph(
        [
            (10, [A, B]),  # 4 m road -> kept
            (15, [B, C]),  # 2 m footpath -> dropped
        ]
    )
    assert graph.graph.number_of_edges() == 1
    assert graph.graph.number_of_nodes() == 2


def test_a_shared_endpoint_becomes_one_node() -> None:
    graph = build_road_graph([(8, [A, B]), (9, [B, C])])
    assert graph.graph.number_of_edges() == 2
    assert graph.graph.number_of_nodes() == 3


def test_near_coincident_endpoints_quantise_to_one_node() -> None:
    b_almost = (2600100.4, 1200000.3)  # within a metre of B
    graph = build_road_graph([(8, [A, B]), (9, [b_almost, C])])
    assert graph.graph.number_of_nodes() == 3


def test_degenerate_segments_are_skipped() -> None:
    graph = build_road_graph([(10, [A]), (10, [A, A])])
    assert graph.graph.number_of_edges() == 0


@pytest.mark.realdata
@pytest.mark.skipif(not ROAD_GDB, reason="set ROAD_NETWORK_GDB to the swissTLM3D .gdb")
def test_real_road_graph_is_plausible() -> None:
    assert ROAD_GDB is not None
    graph = load_road_graph(Path(ROAD_GDB))

    assert graph.graph.number_of_edges() > 500_000
    assert graph.graph.number_of_nodes() > 500_000
    easts = [point[0] for point in graph.node_point.values()]
    norths = [point[1] for point in graph.node_point.values()]
    assert 2_480_000 < min(easts) and max(easts) < 2_840_000
    assert 1_070_000 < min(norths) and max(norths) < 1_300_000
