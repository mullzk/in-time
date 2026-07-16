import os
from pathlib import Path

import pytest

from pipeline.railnet import RailRouter
from pipeline.railnet_gdb import load_rail_graph

GDB = os.environ.get("RAIL_NETWORK_GDB")

ZURICH_HB = 8503000
BERN = 8507000


@pytest.mark.realdata
@pytest.mark.skipif(not GDB, reason="set RAIL_NETWORK_GDB to the schienennetz .gdb")
def test_real_rail_graph_is_plausible() -> None:
    assert GDB is not None
    rail_graph = load_rail_graph(Path(GDB))

    assert rail_graph.graph.number_of_nodes() > 3000
    assert len(rail_graph.didok_to_node) > 3000
    assert ZURICH_HB in rail_graph.didok_to_node
    assert BERN in rail_graph.didok_to_node

    router = RailRouter(rail_graph)
    assert len(router.edges) >= rail_graph.graph.number_of_edges()
    assert router.component_count() < 20  # bridging collapses the ~50 raw ones

    path = router.signed_path(
        rail_graph.didok_to_node[ZURICH_HB], rail_graph.didok_to_node[BERN]
    )
    assert path is not None and len(path) > 5
