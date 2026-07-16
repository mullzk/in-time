from pipeline.railnet import RailGraph, RailRouter, polyline_length

# Points are LV95 metres (east, north).
A = (0.0, 1000.0)
B = (1000.0, 1000.0)
C = (2000.0, 1000.0)


def line_graph() -> RailGraph:
    # A --edge0-- B --edge1-- C, edge0 with an intermediate vertex.
    return RailGraph.from_segments(
        nodes={"A": A, "B": B, "C": C},
        segments=[
            ("A", "B", [A, (500.0, 1000.0), B]),
            ("B", "C", [B, C]),
        ],
        didok_to_node={100: "A", 200: "B", 300: "C"},
    )


def test_shared_edges_are_deduplicated_and_canonically_oriented() -> None:
    router = RailRouter(line_graph())

    assert len(router.edges) == 2
    # Canonical orientation: each polyline starts at the sorted-min node.
    assert router.edges[router.edge_index_of("A", "B")][0] == A
    assert router.edges[router.edge_index_of("B", "C")][0] == B


def test_edge_length_matches_polyline() -> None:
    router = RailRouter(line_graph())
    index = router.edge_index_of("A", "B")
    assert router.edges[index] and polyline_length(router.edges[index]) == 1000.0


def test_signed_path_forward_and_reverse() -> None:
    router = RailRouter(line_graph())
    edge_ab = router.edge_index_of("A", "B") + 1
    edge_bc = router.edge_index_of("B", "C") + 1

    assert router.signed_path("A", "C") == [edge_ab, edge_bc]
    # The reverse leg traverses the same edges with flipped signs.
    assert router.signed_path("C", "A") == [-edge_bc, -edge_ab]


def test_signed_path_returns_none_without_connection() -> None:
    graph = RailGraph.from_segments(
        nodes={"A": A, "C": C},
        segments=[],
        didok_to_node={},
    )
    router = RailRouter(graph)
    assert router.signed_path("A", "C") is None


def test_co_located_components_are_bridged() -> None:
    # Two disjoint segments whose inner ends sit 50 m apart get bridged, so a
    # path can cross from one component into the other.
    near_b = (1000.0, 1000.0)
    near_c = (1050.0, 1000.0)
    graph = RailGraph.from_segments(
        nodes={"A": A, "B": near_b, "C": near_c, "D": (2050.0, 1000.0)},
        segments=[
            ("A", "B", [A, near_b]),
            ("C", "D", [near_c, (2050.0, 1000.0)]),
        ],
        didok_to_node={},
    )
    router = RailRouter(graph)

    path = router.signed_path("A", "D")
    assert path is not None
    assert len(path) == 3  # edge A-B, bridge B-C, edge C-D
