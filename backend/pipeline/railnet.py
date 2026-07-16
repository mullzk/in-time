"""Rail network graph and shared-edge routing in LV95 metres."""

from __future__ import annotations

import math
from collections import defaultdict
from collections.abc import Iterable
from dataclasses import dataclass

import networkx as nx
from shapely.geometry import LineString

Point = tuple[float, float]

SIMPLIFY_TOLERANCE_METRES = 30.0
BRIDGE_MAX_METRES = 150.0
SNAP_MAX_METRES = 1500.0
SNAP_RADIUS_METRES = 400.0
DETOUR_FACTOR = 4.0
DETOUR_SLACK_METRES = 4000.0
RECOVER_SLACK_METRES = 10000.0

Segment = tuple[str, str, list[Point]]


@dataclass
class RoutedLeg:
    signed_path: list[int]
    method: str  # "direct" | "multi_snap" | "recover" | "straight"


@dataclass
class StraightFallback:
    from_didok: int
    to_didok: int
    distance_metres: float


def distance(a: Point, b: Point) -> float:
    return math.hypot(b[0] - a[0], b[1] - a[1])


def polyline_length(points: list[Point]) -> float:
    return sum(distance(p, q) for p, q in zip(points, points[1:], strict=False))


def _oriented(points: list[Point], start: Point) -> list[Point]:
    if distance(points[-1], start) < distance(points[0], start):
        return list(reversed(points))
    return points


def _simplify(points: list[Point], tolerance: float) -> list[Point]:
    line = LineString(points).simplify(tolerance, preserve_topology=False)
    coords = [(float(x), float(y)) for x, y in line.coords]
    return coords if len(coords) >= 2 else points


@dataclass
class RailGraph:
    graph: nx.Graph[str]
    node_point: dict[str, Point]
    didok_to_node: dict[int, str]
    edge_points: dict[frozenset[str], list[Point]]

    @classmethod
    def from_segments(
        cls,
        nodes: dict[str, Point],
        segments: list[Segment],
        didok_to_node: dict[int, str],
    ) -> RailGraph:
        graph: nx.Graph[str] = nx.Graph()
        graph.add_nodes_from(nodes)
        edge_points: dict[frozenset[str], list[Point]] = {}
        for first, second, points in segments:
            graph.add_edge(first, second, weight=polyline_length(points))
            edge_points[frozenset((first, second))] = points
        return cls(
            graph=graph,
            node_point=nodes,
            didok_to_node=didok_to_node,
            edge_points=edge_points,
        )


class RailRouter:
    """Shared, deduplicated rail edges and leg routing.

    Each network edge is stored once, its polyline oriented from the
    alphabetically smaller node to the larger. A leg is routed as a list of
    signed edge indices: the magnitude picks the edge (1-based, because 0 could
    not carry a sign), the sign gives the direction — positive for the stored
    orientation, negative for the reverse.
    """

    def __init__(
        self,
        rail_graph: RailGraph,
        simplify_tolerance: float = SIMPLIFY_TOLERANCE_METRES,
    ) -> None:
        self._graph = rail_graph.graph.copy()
        self._node_point = rail_graph.node_point
        self._didok_to_node = rail_graph.didok_to_node
        self.edges: list[list[Point]] = []
        self._edge_index: dict[frozenset[str], int] = {}
        self._edge_uv: list[tuple[str, str]] = []
        self._edge_length: list[float] = []
        self._routable: list[str] | None = None
        self._gnode_cache: dict[str, str | None] = {}
        self._near_cache: dict[int, list[str]] = {}
        self._build_shared_edges(rail_graph.edge_points, simplify_tolerance)
        self._bridge_components()

    def _register_edge(
        self, key: frozenset[str], uv: tuple[str, str], points: list[Point]
    ) -> None:
        self._edge_index[key] = len(self.edges)
        self._edge_uv.append(uv)
        self.edges.append(points)
        self._edge_length.append(polyline_length(points))

    def _build_shared_edges(
        self, edge_points: dict[frozenset[str], list[Point]], tolerance: float
    ) -> None:
        for first, second in self._graph.edges():
            key = frozenset((first, second))
            low, high = sorted((first, second))
            oriented = _oriented(edge_points[key], self._node_point[low])
            simplified = _simplify(oriented, tolerance)
            self._register_edge(key, (low, high), simplified)

    def _bridge_components(self) -> None:
        component_of: dict[str, int] = {}
        for index, component in enumerate(nx.connected_components(self._graph)):
            for node in component:
                component_of[node] = index

        cell = BRIDGE_MAX_METRES
        buckets: dict[tuple[int, int], list[str]] = defaultdict(list)
        for node in self._graph.nodes():
            east, north = self._node_point[node]
            buckets[(int(east / cell), int(north / cell))].append(node)

        for node in list(self._graph.nodes()):
            east, north = self._node_point[node]
            base_east, base_north = int(east / cell), int(north / cell)
            for delta_east in (-1, 0, 1):
                for delta_north in (-1, 0, 1):
                    cell_key = (base_east + delta_east, base_north + delta_north)
                    for other in buckets.get(cell_key, ()):
                        if other <= node or component_of[node] == component_of[other]:
                            continue
                        gap = distance(self._node_point[node], self._node_point[other])
                        if gap > BRIDGE_MAX_METRES:
                            continue
                        key = frozenset((node, other))
                        if key in self._edge_index:
                            continue
                        low, high = sorted((node, other))
                        self._register_edge(
                            key,
                            (low, high),
                            [self._node_point[low], self._node_point[high]],
                        )
                        self._graph.add_edge(node, other, weight=gap)

    def edge_index_of(self, first: str, second: str) -> int:
        return self._edge_index[frozenset((first, second))]

    def component_count(self) -> int:
        return nx.number_connected_components(self._graph)

    def signed_length(self, signed_path: list[int]) -> float:
        return sum(self._edge_length[abs(edge) - 1] for edge in signed_path)

    def signed_path(self, node_a: str, node_b: str) -> list[int] | None:
        try:
            hops: list[str] = nx.shortest_path(
                self._graph, node_a, node_b, weight="weight"
            )
        except (nx.NetworkXNoPath, nx.NodeNotFound):
            return None
        signed: list[int] = []
        for current, following in zip(hops, hops[1:], strict=False):
            index = self._edge_index[frozenset((current, following))]
            forward = self._edge_uv[index][0] == current
            signed.append((index + 1) if forward else -(index + 1))
        return signed

    def route_pairs(
        self, pairs: Iterable[tuple[int, int]]
    ) -> dict[tuple[int, int], RoutedLeg]:
        self._ensure_routing_index()
        pair_set = set(pairs)
        routed: dict[tuple[int, int], RoutedLeg] = {}

        for pair in pair_set:
            signed = self._route_snapped(*pair)
            if signed is not None:
                routed[pair] = signed

        self._recover_missing(pair_set, routed)

        straight_edges: dict[tuple[int, int], list[int]] = {}
        for pair in pair_set:
            if pair in routed:
                continue
            first, second = self._didok_point(pair[0]), self._didok_point(pair[1])
            if first is None or second is None:
                continue
            if pair not in straight_edges:
                straight_edges[pair] = [self._add_straight_edge(first, second)]
            routed[pair] = RoutedLeg(straight_edges[pair], "straight")
        return routed

    def straight_fallbacks(
        self, routed: dict[tuple[int, int], RoutedLeg]
    ) -> list[StraightFallback]:
        fallbacks = []
        for (first, second), leg in routed.items():
            if leg.method != "straight":
                continue
            distance_metres = self._straight_distance(first, second)
            if distance_metres is None:
                continue
            fallbacks.append(StraightFallback(first, second, distance_metres))
        fallbacks.sort(key=lambda item: item.distance_metres, reverse=True)
        return fallbacks

    def _ensure_routing_index(self) -> None:
        if self._routable is None:
            self._routable = [
                node for node in self._graph if self._graph.degree(node) > 0
            ]

    def _didok_point(self, didok: int) -> Point | None:
        node = self._didok_to_node.get(didok)
        return self._node_point[node] if node is not None else None

    def _straight_distance(self, first: int, second: int) -> float | None:
        start, end = self._didok_point(first), self._didok_point(second)
        return distance(start, end) if start is not None and end is not None else None

    def _graph_node_for(self, node_id: str) -> str | None:
        if node_id in self._graph and self._graph.degree(node_id) > 0:
            return node_id
        if node_id in self._gnode_cache:
            return self._gnode_cache[node_id]
        point = self._node_point[node_id]
        nearest = min(
            self._routable or [],
            key=lambda candidate: distance(point, self._node_point[candidate]),
            default=None,
        )
        self._gnode_cache[node_id] = nearest
        return nearest

    def _near_nodes(self, didok: int) -> list[str]:
        if didok in self._near_cache:
            return self._near_cache[didok]
        node = self._didok_to_node.get(didok)
        near: list[str] = []
        if node is not None:
            center = self._node_point[node]
            near = [
                candidate
                for candidate in self._routable or []
                if distance(center, self._node_point[candidate]) <= SNAP_RADIUS_METRES
            ]
        self._near_cache[didok] = near
        return near

    def _within_detour(self, signed_path: list[int], straight: float) -> bool:
        limit = max(straight * DETOUR_FACTOR, straight + DETOUR_SLACK_METRES)
        return self.signed_length(signed_path) <= limit

    def _route_snapped(self, first: int, second: int) -> RoutedLeg | None:
        straight = self._straight_distance(first, second)
        direct = self._try_direct(first, second)
        if (
            direct is not None
            and straight is not None
            and (self.signed_length(direct) <= 1.8 * straight + 500)
        ):
            return RoutedLeg(direct, "direct")

        multi = self._multi_snap(first, second)
        if multi is not None and (
            direct is None or self.signed_length(multi) < self.signed_length(direct)
        ):
            return RoutedLeg(multi, "multi_snap")
        return RoutedLeg(direct, "direct") if direct is not None else None

    def _try_direct(self, first: int, second: int) -> list[int] | None:
        node0, node1 = self._didok_to_node.get(first), self._didok_to_node.get(second)
        if node0 is None or node1 is None:
            return None
        graph0, graph1 = self._graph_node_for(node0), self._graph_node_for(node1)
        if graph0 is None or graph1 is None or graph0 == graph1:
            return None
        point0, point1 = self._node_point[node0], self._node_point[node1]
        if (
            distance(point0, self._node_point[graph0]) > SNAP_MAX_METRES
            or distance(point1, self._node_point[graph1]) > SNAP_MAX_METRES
        ):
            return None
        signed = self.signed_path(graph0, graph1)
        if signed is None:
            return None
        return signed if self._within_detour(signed, distance(point0, point1)) else None

    def _multi_snap(self, first: int, second: int) -> list[int] | None:
        straight = self._straight_distance(first, second)
        if straight is None:
            return None
        best: list[int] | None = None
        best_length: float | None = None
        for start in self._near_nodes(first):
            for end in self._near_nodes(second):
                if start == end:
                    continue
                signed = self.signed_path(start, end)
                if signed is None:
                    continue
                length = self.signed_length(signed)
                if best_length is None or length < best_length:
                    best, best_length = signed, length
        if best is not None and self._within_detour(best, straight):
            return best
        return None

    def _recover_missing(
        self,
        pair_set: set[tuple[int, int]],
        routed: dict[tuple[int, int], RoutedLeg],
    ) -> None:
        good: nx.Graph[int] = nx.Graph()
        for (first, second), leg in routed.items():
            weight = self.signed_length(leg.signed_path)
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
            recovered = self._recover_over(good, *pair)
            if recovered is not None:
                routed[pair] = RoutedLeg(recovered, "recover")

    def _recover_over(
        self, good: nx.Graph[int], first: int, second: int
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
            straight * DETOUR_FACTOR, straight + RECOVER_SLACK_METRES
        ):
            return None
        return composed

    def _add_straight_edge(self, start: Point, end: Point) -> int:
        self.edges.append([start, end])
        self._edge_uv.append(("", ""))
        self._edge_length.append(distance(start, end))
        return len(self.edges)  # 1-based forward index
