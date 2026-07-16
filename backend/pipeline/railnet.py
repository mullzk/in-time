"""Rail network graph and shared-edge routing in LV95 metres."""

from __future__ import annotations

import math
from collections import defaultdict
from dataclasses import dataclass

import networkx as nx
from shapely.geometry import LineString

Point = tuple[float, float]

SIMPLIFY_TOLERANCE_METRES = 30.0
BRIDGE_MAX_METRES = 150.0

Segment = tuple[str, str, list[Point]]


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
        self.edges: list[list[Point]] = []
        self._edge_index: dict[frozenset[str], int] = {}
        self._edge_uv: list[tuple[str, str]] = []
        self._edge_length: list[float] = []
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
