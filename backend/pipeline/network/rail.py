"""Rail network graph and shared-edge leg routing over the BAV network in LV95.

A rail (or tram) station already sits on a network node — its DiDok maps to it —
so legs route from that node. When that fails the router widens the search: over
the nodes nearby, then over legs it has already routed, and finally it draws a
straight line when two stations cannot be connected at all."""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass

import networkx as nx

from pipeline.network.edges import SharedEdges
from pipeline.network.geometry import Point, distance
from pipeline.network.graph import NetworkGraph, Segment
from pipeline.network.thresholds import DEFAULT_THRESHOLDS, RoutingThresholds

__all__ = ["RailGraph", "RailRouter", "RoutedLeg", "StraightFallback"]

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
    """One leg placed on the network: the edges it runs over, and how it was
    found — the method drives the routing-quality report."""

    signed_path: list[int]
    method: str  # "direct" | "multi_snap" | "recover" | "straight"


@dataclass
class StraightFallback:
    from_didok: int
    to_didok: int
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
        self._nodes_with_tracks = self._edges.nodes_with_tracks()
        self._nodes_with_tracks_set = set(self._nodes_with_tracks)
        self._thresholds = thresholds
        self._entry_node_cache: dict[int, list[str]] = {}

    @property
    def edges(self) -> list[list[Point]]:
        return self._edges.polylines

    def edge_index_of(self, first: str, second: str) -> int:
        return self._edges.edge_index_between(first, second)

    def subnetwork_count(self) -> int:
        return self._edges.subnetwork_count()

    def path_length_metres(self, edge_path: list[int]) -> float:
        return self._edges.path_length_metres(edge_path)

    def edge_path_between_nodes(self, from_node: str, to_node: str) -> list[int] | None:
        return self._edges.edge_path_between(from_node, to_node)

    def route(
        self, station_pairs: Iterable[tuple[int, int]]
    ) -> dict[tuple[int, int], RoutedLeg]:
        pair_set = set(station_pairs)
        routed: dict[tuple[int, int], RoutedLeg] = {}
        for pair in pair_set:
            leg = self._shortest_leg_over_network(pair[0], pair[1])
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
            straight = self._straight_line_distance_metres(first, second)
            if straight is None:
                continue
            fallbacks.append(StraightFallback(first, second, straight))
        fallbacks.sort(key=lambda item: item.distance_metres, reverse=True)
        return fallbacks

    def _location(self, didok: int) -> Point | None:
        node = self._station_to_node.get(didok)
        return self._node_point[node] if node is not None else None

    def _entry_node(self, didok: int) -> str | None:
        node = self._station_to_node.get(didok)
        return node if node in self._nodes_with_tracks_set else None

    def _nearby_entry_nodes(self, didok: int) -> list[str]:
        if didok not in self._entry_node_cache:
            self._entry_node_cache[didok] = self._resolve_nearby_entry_nodes(didok)
        return self._entry_node_cache[didok]

    def _resolve_nearby_entry_nodes(self, didok: int) -> list[str]:
        location = self._location(didok)
        if location is None:
            return []
        radius = self._thresholds.entry_candidate_radius_metres
        return [
            node
            for node in self._nodes_with_tracks
            if distance(location, self._node_point[node]) <= radius
        ]

    def _shortest_leg_over_network(self, first: int, second: int) -> RoutedLeg | None:
        straight = self._straight_line_distance_metres(first, second)
        direct = self._leg_between_station_nodes(first, second)
        if (
            direct is not None
            and straight is not None
            and self._edges.path_length_metres(direct)
            <= DIRECT_ACCEPT_FACTOR * straight + DIRECT_ACCEPT_SLACK_METRES
        ):
            return RoutedLeg(direct, "direct")

        over_neighbours = self._leg_over_nearby_entry_nodes(first, second)
        if over_neighbours is not None and (
            direct is None
            or self._edges.path_length_metres(over_neighbours)
            < self._edges.path_length_metres(direct)
        ):
            return RoutedLeg(over_neighbours, "multi_snap")
        return RoutedLeg(direct, "direct") if direct is not None else None

    def _leg_between_station_nodes(self, first: int, second: int) -> list[int] | None:
        entry_first = self._entry_node(first)
        entry_second = self._entry_node(second)
        if entry_first is None or entry_second is None or entry_first == entry_second:
            return None
        edge_path = self._edges.edge_path_between(entry_first, entry_second)
        straight = self._straight_line_distance_metres(first, second)
        if edge_path is None or straight is None:
            return None
        return edge_path if self._is_within_detour_limit(edge_path, straight) else None

    def _leg_over_nearby_entry_nodes(self, first: int, second: int) -> list[int] | None:
        straight = self._straight_line_distance_metres(first, second)
        if straight is None:
            return None
        best: list[int] | None = None
        best_length: float | None = None
        for start in self._nearby_entry_nodes(first):
            for end in self._nearby_entry_nodes(second):
                if start == end:
                    continue
                edge_path = self._edges.edge_path_between(start, end)
                if edge_path is None:
                    continue
                length = self._edges.path_length_metres(edge_path)
                if best_length is None or length < best_length:
                    best, best_length = edge_path, length
        if best is not None and self._is_within_detour_limit(best, straight):
            return best
        return None

    def _is_within_detour_limit(self, edge_path: list[int], straight: float) -> bool:
        limit = max(
            straight * self._thresholds.detour_factor,
            straight + self._thresholds.detour_slack_metres,
        )
        return self._edges.path_length_metres(edge_path) <= limit

    def _straight_line_distance_metres(self, first: int, second: int) -> float | None:
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
                [self._edges.append_straight_edge(start, end)], "straight"
            )

    def _recover_missing(
        self,
        pair_set: set[tuple[int, int]],
        routed: dict[tuple[int, int], RoutedLeg],
    ) -> None:
        routed_leg_graph = self._graph_of_routed_legs(routed)
        for pair in pair_set:
            if pair in routed:
                continue
            recovered = self._leg_composed_of_routed_legs(
                routed_leg_graph, pair[0], pair[1]
            )
            if recovered is not None:
                routed[pair] = RoutedLeg(recovered, "recover")

    def _graph_of_routed_legs(
        self, routed: dict[tuple[int, int], RoutedLeg]
    ) -> nx.Graph[int]:
        routed_leg_graph: nx.Graph[int] = nx.Graph()
        for (first, second), leg in routed.items():
            weight = self._edges.path_length_metres(leg.signed_path)
            if (
                not routed_leg_graph.has_edge(first, second)
                or weight < routed_leg_graph[first][second]["weight"]
            ):
                routed_leg_graph.add_edge(
                    first, second, weight=weight, signed=leg.signed_path, forward=first
                )
        return routed_leg_graph

    def _leg_composed_of_routed_legs(
        self,
        routed_leg_graph: nx.Graph[int],
        first: int,
        second: int,
    ) -> list[int] | None:
        if first not in routed_leg_graph or second not in routed_leg_graph:
            return None
        try:
            hops: list[int] = nx.shortest_path(
                routed_leg_graph, first, second, weight="weight"
            )
        except (nx.NetworkXNoPath, nx.NodeNotFound):
            return None
        composed: list[int] = []
        total = 0.0
        for start, end in zip(hops, hops[1:], strict=False):
            data = routed_leg_graph[start][end]
            stored: list[int] = data["signed"]
            segment = (
                stored if data["forward"] == start else [-s for s in reversed(stored)]
            )
            composed.extend(segment)
            total += float(data["weight"])
        straight = self._straight_line_distance_metres(first, second)
        if straight is not None and total > max(
            straight * self._thresholds.detour_factor,
            straight + self._thresholds.recover_slack_metres,
        ):
            return None
        return composed
