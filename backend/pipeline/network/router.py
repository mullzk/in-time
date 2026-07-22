"""Mode-agnostic leg routing over a shared-edge network."""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass

import networkx as nx

from pipeline.network.access import NetworkAccess, StationAnchor
from pipeline.network.edges import SharedEdges
from pipeline.network.geometry import Point, distance
from pipeline.network.graph import NetworkGraph
from pipeline.network.thresholds import DEFAULT_THRESHOLDS, RoutingThresholds

# A direct leg is kept over a multi-snap alternative when it is at most this much
# longer than the straight line between the two stations.
DIRECT_ACCEPT_FACTOR = 1.8
DIRECT_ACCEPT_SLACK_METRES = 500.0


@dataclass
class RoutedLeg:
    signed_path: list[int]
    method: str  # "direct" | "multi_snap" | "recover" | "straight"


@dataclass
class StraightFallback:
    from_key: int
    to_key: int
    distance_metres: float


class NetworkRouter:
    """Routes each leg (a pair of station keys) over the network: it snaps both
    ends to entry nodes and takes the shortest signed path, widening the search
    (multi-snap, then recover over already-routed legs) before falling back to a
    straight line. Anchors are fixed for the router's lifetime; `route` then
    takes only the pairs to connect."""

    def __init__(
        self,
        network: NetworkGraph,
        anchors: dict[int, StationAnchor],
        thresholds: RoutingThresholds = DEFAULT_THRESHOLDS,
    ) -> None:
        self._edges = SharedEdges.build(network, thresholds)
        self._access: NetworkAccess = NetworkAccess(
            anchors, network.node_point, self._edges.routable_nodes(), thresholds
        )
        self._thresholds = thresholds

    @property
    def edges(self) -> list[list[Point]]:
        return self._edges.polylines

    def edge_index_of(self, first: str, second: str) -> int:
        return self._edges.index_of(first, second)

    def component_count(self) -> int:
        return self._edges.component_count()

    def signed_length(self, signed_path: list[int]) -> float:
        return self._edges.length_of(signed_path)

    def signed_path(self, node_a: str, node_b: str) -> list[int] | None:
        return self._edges.signed_between(node_a, node_b)

    def route(
        self, pairs: Iterable[tuple[int, int]]
    ) -> dict[tuple[int, int], RoutedLeg]:
        pair_set = set(pairs)
        routed: dict[tuple[int, int], RoutedLeg] = {}
        for pair in pair_set:
            leg = self._route_snapped(pair[0], pair[1])
            if leg is not None:
                routed[pair] = leg
        self._recover_missing(pair_set, routed)
        self._add_straight_fallbacks(pair_set, routed)
        return routed

    def straight_fallbacks(
        self, routed: dict[tuple[int, int], RoutedLeg]
    ) -> list[StraightFallback]:
        fallbacks: list[StraightFallback] = []
        for (first, second), leg in routed.items():
            if leg.method != "straight":
                continue
            straight = self._straight_distance(first, second)
            if straight is None:
                continue
            fallbacks.append(StraightFallback(first, second, straight))
        fallbacks.sort(key=lambda item: item.distance_metres, reverse=True)
        return fallbacks

    def _route_snapped(self, first: int, second: int) -> RoutedLeg | None:
        straight = self._straight_distance(first, second)
        direct = self._try_direct(first, second)
        if (
            direct is not None
            and straight is not None
            and self._edges.length_of(direct)
            <= DIRECT_ACCEPT_FACTOR * straight + DIRECT_ACCEPT_SLACK_METRES
        ):
            return RoutedLeg(direct, "direct")

        multi = self._multi_snap(first, second)
        if multi is not None and (
            direct is None
            or self._edges.length_of(multi) < self._edges.length_of(direct)
        ):
            return RoutedLeg(multi, "multi_snap")
        return RoutedLeg(direct, "direct") if direct is not None else None

    def _try_direct(self, first: int, second: int) -> list[int] | None:
        entry_first = self._access.entry_node(first)
        entry_second = self._access.entry_node(second)
        if entry_first is None or entry_second is None or entry_first == entry_second:
            return None
        signed = self._edges.signed_between(entry_first, entry_second)
        straight = self._straight_distance(first, second)
        if signed is None or straight is None:
            return None
        return signed if self._within_detour(signed, straight) else None

    def _multi_snap(self, first: int, second: int) -> list[int] | None:
        straight = self._straight_distance(first, second)
        if straight is None:
            return None
        best: list[int] | None = None
        best_length: float | None = None
        for start in self._access.entry_candidates(first):
            for end in self._access.entry_candidates(second):
                if start == end:
                    continue
                signed = self._edges.signed_between(start, end)
                if signed is None:
                    continue
                length = self._edges.length_of(signed)
                if best_length is None or length < best_length:
                    best, best_length = signed, length
        if best is not None and self._within_detour(best, straight):
            return best
        return None

    def _within_detour(self, signed_path: list[int], straight: float) -> bool:
        limit = max(
            straight * self._thresholds.detour_factor,
            straight + self._thresholds.detour_slack_metres,
        )
        return self._edges.length_of(signed_path) <= limit

    def _straight_distance(self, first: int, second: int) -> float | None:
        start = self._access.location(first)
        end = self._access.location(second)
        return distance(start, end) if start is not None and end is not None else None

    def _add_straight_fallbacks(
        self,
        pair_set: set[tuple[int, int]],
        routed: dict[tuple[int, int], RoutedLeg],
    ) -> None:
        straight_edges: dict[tuple[int, int], list[int]] = {}
        for pair in pair_set:
            if pair in routed:
                continue
            start = self._access.location(pair[0])
            end = self._access.location(pair[1])
            if start is None or end is None:
                continue
            if pair not in straight_edges:
                straight_edges[pair] = [self._edges.append_straight(start, end)]
            routed[pair] = RoutedLeg(straight_edges[pair], "straight")

    def _recover_missing(
        self,
        pair_set: set[tuple[int, int]],
        routed: dict[tuple[int, int], RoutedLeg],
    ) -> None:
        good: nx.Graph[int] = nx.Graph()
        for (first, second), leg in routed.items():
            weight = self._edges.length_of(leg.signed_path)
            if (
                not good.has_edge(first, second)
                or weight < good[first][second]["weight"]
            ):
                good.add_edge(
                    first, second, weight=weight, signed=leg.signed_path, forward=first
                )

        for pair in pair_set:
            if pair in routed:
                continue
            recovered = self._recover_over(good, pair[0], pair[1])
            if recovered is not None:
                routed[pair] = RoutedLeg(recovered, "recover")

    def _recover_over(
        self,
        good: nx.Graph[int],
        first: int,
        second: int,
    ) -> list[int] | None:
        if first not in good or second not in good:
            return None
        try:
            hops: list[int] = nx.shortest_path(good, first, second, weight="weight")
        except (nx.NetworkXNoPath, nx.NodeNotFound):
            return None
        composed: list[int] = []
        total = 0.0
        for start, end in zip(hops, hops[1:], strict=False):
            data = good[start][end]
            stored: list[int] = data["signed"]
            segment = (
                stored if data["forward"] == start else [-s for s in reversed(stored)]
            )
            composed.extend(segment)
            total += float(data["weight"])
        straight = self._straight_distance(first, second)
        if straight is not None and total > max(
            straight * self._thresholds.detour_factor,
            straight + self._thresholds.recover_slack_metres,
        ):
            return None
        return composed
