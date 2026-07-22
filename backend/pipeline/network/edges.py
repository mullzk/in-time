"""The network's edges stored once and addressed by a signed index."""

from __future__ import annotations

from collections import defaultdict

import networkx as nx

from pipeline.network.geometry import (
    Point,
    distance,
    oriented,
    polyline_length,
    simplify,
)
from pipeline.network.graph import NetworkGraph
from pipeline.network.thresholds import RoutingThresholds


class SharedEdges:
    """Every network edge stored once, its polyline oriented from the smaller to
    the larger node id. A leg is a list of signed 1-based indices: the magnitude
    picks the edge (1-based, because 0 could not carry a sign), the sign gives
    the travel direction (positive = stored orientation). Disconnected
    components whose nearest nodes are close are bridged so a leg can cross
    between them."""

    def __init__(self, graph: nx.Graph[str], node_point: dict[str, Point]) -> None:
        self._graph = graph
        self._node_point = node_point
        self.polylines: list[list[Point]] = []
        self._index: dict[frozenset[str], int] = {}
        self._endpoints: list[tuple[str, str]] = []
        self._lengths: list[float] = []

    @classmethod
    def build(cls, network: NetworkGraph, thresholds: RoutingThresholds) -> SharedEdges:
        edges = cls(network.graph.copy(), network.node_point)
        edges._register_segments(
            network.edge_points, thresholds.simplify_tolerance_metres
        )
        edges._bridge_components(thresholds.component_bridge_max_metres)
        return edges

    def _register(self, endpoints: tuple[str, str], polyline: list[Point]) -> None:
        self._index[frozenset(endpoints)] = len(self.polylines)
        self._endpoints.append(endpoints)
        self.polylines.append(polyline)
        self._lengths.append(polyline_length(polyline))

    def _register_segments(
        self, edge_points: dict[frozenset[str], list[Point]], tolerance: float
    ) -> None:
        for first, second in self._graph.edges():
            low, high = sorted((first, second))
            geometry = oriented(
                edge_points[frozenset((first, second))], self._node_point[low]
            )
            self._register((low, high), simplify(geometry, tolerance))

    def _bridge_components(self, bridge_max: float) -> None:
        component_of: dict[str, int] = {}
        for index, component in enumerate(nx.connected_components(self._graph)):
            for node in component:
                component_of[node] = index

        buckets: dict[tuple[int, int], list[str]] = defaultdict(list)
        for node in self._graph.nodes():
            east, north = self._node_point[node]
            buckets[(int(east / bridge_max), int(north / bridge_max))].append(node)

        for node in list(self._graph.nodes()):
            east, north = self._node_point[node]
            base_east, base_north = int(east / bridge_max), int(north / bridge_max)
            for delta_east in (-1, 0, 1):
                for delta_north in (-1, 0, 1):
                    cell = (base_east + delta_east, base_north + delta_north)
                    for other in buckets.get(cell, ()):
                        if other <= node or component_of[node] == component_of[other]:
                            continue
                        gap = distance(self._node_point[node], self._node_point[other])
                        if gap > bridge_max:
                            continue
                        if frozenset((node, other)) in self._index:
                            continue
                        low, high = sorted((node, other))
                        self._register(
                            (low, high),
                            [self._node_point[low], self._node_point[high]],
                        )
                        self._graph.add_edge(node, other, weight=gap)

    def routable_nodes(self) -> list[str]:
        return [node for node in self._graph if self._graph.degree(node) > 0]

    def component_count(self) -> int:
        return nx.number_connected_components(self._graph)

    def index_of(self, first: str, second: str) -> int:
        return self._index[frozenset((first, second))]

    def length_of(self, signed_path: list[int]) -> float:
        return sum(self._lengths[abs(edge) - 1] for edge in signed_path)

    def signed_between(self, node_a: str, node_b: str) -> list[int] | None:
        try:
            hops: list[str] = nx.shortest_path(
                self._graph, node_a, node_b, weight="weight"
            )
        except (nx.NetworkXNoPath, nx.NodeNotFound):
            return None
        signed: list[int] = []
        for current, following in zip(hops, hops[1:], strict=False):
            index = self._index[frozenset((current, following))]
            forward = self._endpoints[index][0] == current
            signed.append((index + 1) if forward else -(index + 1))
        return signed

    def append_straight(self, start: Point, end: Point) -> int:
        self.polylines.append([start, end])
        self._endpoints.append(("", ""))
        self._lengths.append(distance(start, end))
        return len(self.polylines)  # 1-based forward index
