from pipeline.network.rail import RailGraph, RailRouter

# A B C D on a line (all routable); E far away and disconnected.
A = (0.0, 0.0)
B = (1000.0, 0.0)
C = (2000.0, 0.0)
D = (3000.0, 0.0)
E = (50000.0, 0.0)


def line_graph() -> RailGraph:
    return RailGraph.from_rail_segments(
        nodes={"A": A, "B": B, "C": C, "D": D, "E": E},
        segments=[
            ("A", "B", [A, B]),
            ("B", "C", [B, C]),
            ("C", "D", [C, D]),
        ],
        station_to_node={1: "A", 2: "B", 3: "C", 4: "D", 5: "E"},
    )


def test_direct_leg_routes_over_graph() -> None:
    router = RailRouter(line_graph())
    routed = router.route([(1, 4)])

    assert routed[(1, 4)].method == "direct"
    assert router.signed_length(routed[(1, 4)].signed_path) == 3000.0


def test_unconnectable_leg_falls_back_to_straight_line() -> None:
    router = RailRouter(line_graph())
    edges_before = len(router.edges)
    routed = router.route([(1, 5)])

    leg = routed[(1, 5)]
    assert leg.method == "straight"
    # A single synthetic 2-point edge was appended for the straight line.
    assert len(router.edges) == edges_before + 1
    straight_edge = router.edges[abs(leg.signed_path[0]) - 1]
    assert straight_edge == [A, E]


def test_recover_uses_other_good_legs_not_a_straight_line() -> None:
    # (1,4) has no single good leg pre-routed, but (1,2),(2,3),(3,4) do, so it is
    # recovered over real track rather than drawn straight.
    router = RailRouter(line_graph())
    routed = router.route([(1, 2), (2, 3), (3, 4), (1, 4)])

    assert routed[(1, 4)].method in {"direct", "recover"}
    assert routed[(1, 4)].method != "straight"


def test_straight_fallbacks_are_reported_with_distance() -> None:
    router = RailRouter(line_graph())
    routed = router.route([(1, 4), (1, 5)])

    straight = router.straight_fallbacks(routed)
    assert len(straight) == 1
    fallback = straight[0]
    assert (fallback.from_key, fallback.to_key) == (1, 5)
    assert fallback.distance_metres == 50000.0
