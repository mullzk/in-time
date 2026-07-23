"""Rail network graph and shared-edge leg routing over the BAV network in LV95.

A rail (or tram) station already sits on a network node — its DiDok maps to it —
so legs route from that node. The router snaps to the node, widens the search
(multi-snap over nearby nodes, then recover over already-routed legs) and falls
back to a straight line when two stations cannot be connected."""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass

import networkx as nx

from pipeline.network.edges import SharedEdges
from pipeline.network.geometry import Point, distance
from pipeline.network.graph import NetworkGraph, Segment
from pipeline.network.thresholds import DEFAULT_THRESHOLDS, RoutingThresholds

__all__ = ["Point", "RailGraph", "RailRouter", "RoutedLeg", "StraightFallback"]

# A direct leg is kept over a multi-snap alternative when it is at most this much
# longer than the straight line between the two stations.
DIRECT_ACCEPT_FACTOR = 1.8
DIRECT_ACCEPT_SLACK_METRES = 500.0


@dataclass
class RailGraph(NetworkGraph):
    station_to_node: dict[int, str]
    """DiDok station number -> BAV network node id (its Betriebspunkt)."""

    @classmethod
    def from_rail_segments(
        cls,
        nodes: dict[str, Point],
        segments: list[Segment],
        station_to_node: dict[int, str],
        node_name: dict[str, str] | None = None,
    ) -> RailGraph:
        base = NetworkGraph.from_segments(nodes, segments, node_name)
        return cls(
            graph=base.graph,
            node_point=base.node_point,
            edge_points=base.edge_points,
            node_name=base.node_name,
            station_to_node=station_to_node,
        )


@dataclass
class RoutedLeg:
    signed_path: list[int]
    method: str  # "direct" | "multi_snap" | "recover" | "straight"


@dataclass
class StraightFallback:
    from_key: int
    to_key: int
    distance_metres: float


class RailRouter:
    """Routes each leg (a pair of DiDok station numbers) over the BAV network,
    taking the shortest signed path between the stations' own nodes and widening
    the search before falling back to a straight line. The graph is fixed for the
    router's lifetime; `route` then takes only the pairs to connect."""

    def __init__(
        self, rail_graph: RailGraph, thresholds: RoutingThresholds = DEFAULT_THRESHOLDS
    ) -> None:
        self._edges = SharedEdges.build(rail_graph, thresholds)
        self._station_to_node = rail_graph.station_to_node
        self._node_point = rail_graph.node_point
        self._routable = self._edges.routable_nodes()
        self._routable_set = set(self._routable)
        self._thresholds = thresholds
        self._candidate_cache: dict[int, list[str]] = {}

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

    def _location(self, station: int) -> Point | None:
        node = self._station_to_node.get(station)
        return self._node_point[node] if node is not None else None

    def _entry_node(self, station: int) -> str | None:
        node = self._station_to_node.get(station)
        return node if node in self._routable_set else None

    def _entry_candidates(self, station: int) -> list[str]:
        if station not in self._candidate_cache:
            self._candidate_cache[station] = self._resolve_candidates(station)
        return self._candidate_cache[station]

    def _resolve_candidates(self, station: int) -> list[str]:
        location = self._location(station)
        if location is None:
            return []
        radius = self._thresholds.entry_candidate_radius_metres
        return [
            node
            for node in self._routable
            if distance(location, self._node_point[node]) <= radius
        ]

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
        entry_first = self._entry_node(first)
        entry_second = self._entry_node(second)
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
        for start in self._entry_candidates(first):
            for end in self._entry_candidates(second):
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
        start = self._location(first)
        end = self._location(second)
        return distance(start, end) if start is not None and end is not None else None

    def _add_straight_fallbacks(
        self,
        pair_set: set[tuple[int, int]],
        routed: dict[tuple[int, int], RoutedLeg],
    ) -> None:
        for pair in pair_set:
            if pair in routed:
                continue
            start = self._location(pair[0])
            end = self._location(pair[1])
            if start is None or end is None:
                continue
            routed[pair] = RoutedLeg(
                [self._edges.append_straight(start, end)], "straight"
            )

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
