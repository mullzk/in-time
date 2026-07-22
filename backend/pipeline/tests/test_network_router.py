from pipeline.network import (
    NetworkGraph,
    NetworkRouter,
    RoutingThresholds,
    StationAnchor,
)

CLOSE_SNAP = RoutingThresholds(
    max_entry_metres=200.0, entry_candidate_radius_metres=120.0
)

# LV95 metres. A B C D lie on a line; the "stops" (keyed by station number) are
# near the line but do not coincide with any node, so they must be snapped.
A = (0.0, 0.0)
B = (1000.0, 0.0)
C = (2000.0, 0.0)
D = (3000.0, 0.0)

NEAR_A = 1
NEAR_D = 2
FAR = 99


def line_network() -> NetworkGraph:
    return NetworkGraph.from_segments(
        nodes={"A": A, "B": B, "C": C, "D": D},
        segments=[
            ("A", "B", [A, B]),
            ("B", "C", [B, C]),
            ("C", "D", [C, D]),
        ],
    )


def road_router(anchors: dict[int, StationAnchor]) -> NetworkRouter:
    return NetworkRouter(line_network(), anchors, CLOSE_SNAP)


def test_point_leg_snaps_to_nearest_nodes_and_routes() -> None:
    router = road_router(
        {
            NEAR_A: StationAnchor((10.0, 5.0), None),
            NEAR_D: StationAnchor((2990.0, 5.0), None),
        }
    )

    routed = router.route([(NEAR_A, NEAR_D)])

    leg = routed[(NEAR_A, NEAR_D)]
    assert leg.method in {"direct", "multi_snap"}
    assert router.signed_length(leg.signed_path) == 3000.0
    # The routed geometry runs from the snapped A node to the snapped D node.
    first_edge = router.edges[abs(leg.signed_path[0]) - 1]
    start = first_edge[0] if leg.signed_path[0] > 0 else first_edge[-1]
    assert start == A


def test_point_leg_beyond_snap_radius_falls_back_to_straight() -> None:
    far_point = (0.0, 50000.0)
    router = road_router(
        {
            NEAR_A: StationAnchor((10.0, 5.0), None),
            FAR: StationAnchor(far_point, None),
        }
    )

    routed = router.route([(NEAR_A, FAR)])

    leg = routed[(NEAR_A, FAR)]
    assert leg.method == "straight"
    straight_edge = router.edges[abs(leg.signed_path[0]) - 1]
    assert far_point in straight_edge


def test_straight_fallbacks_reported_for_point_anchors() -> None:
    router = road_router(
        {
            NEAR_A: StationAnchor((10.0, 5.0), None),
            FAR: StationAnchor((0.0, 50000.0), None),
        }
    )
    routed = router.route([(NEAR_A, FAR)])

    fallbacks = router.straight_fallbacks(routed)
    assert len(fallbacks) == 1
    assert (fallbacks[0].from_key, fallbacks[0].to_key) == (NEAR_A, FAR)
    assert fallbacks[0].distance_metres > 40000.0
