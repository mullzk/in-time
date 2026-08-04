"""The network's edges stored once and addressed by a signed index."""

from __future__ import annotations

from collections import defaultdict

import networkx as nx

from pipeline.network.geometry import (
    Point,
    distance,
    polyline_length,
    simplify,
    starting_nearest_to,
)
from pipeline.network.graph import NetworkGraph
from pipeline.network.thresholds import RoutingThresholds


class SharedEdges:
    """Every network edge stored once, its polyline oriented from the smaller to
    the larger node id. A leg is a list of signed 1-based indices: the magnitude
    picks the edge (1-based, because 0 could not carry a sign), the sign gives
    the travel direction (positive = stored orientation). Disconnected
    subnetworks whose nearest nodes are close are bridged so a leg can cross
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
        edges._connect_nearby_subnetworks(thresholds.subnetwork_bridge_max_metres)
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
            geometry = starting_nearest_to(
                edge_points[frozenset((first, second))], self._node_point[low]
            )
            self._register((low, high), simplify(geometry, tolerance))

    def _subnetwork_of_each_node(self) -> dict[str, int]:
        subnetwork_of: dict[str, int] = {}
        for index, subnetwork in enumerate(nx.connected_components(self._graph)):
            for node in subnetwork:
                subnetwork_of[node] = index
        return subnetwork_of

    def _nodes_by_grid_cell(self, cell_size: float) -> dict[tuple[int, int], list[str]]:
        cells: dict[tuple[int, int], list[str]] = defaultdict(list)
        for node in self._graph.nodes():
            cells[self._grid_cell(node, cell_size)].append(node)
        return cells

    def _grid_cell(self, node: str, cell_size: float) -> tuple[int, int]:
        east, north = self._node_point[node]
        return int(east / cell_size), int(north / cell_size)

    def _connect_nearby_subnetworks(self, bridge_max: float) -> None:
        subnetwork_of = self._subnetwork_of_each_node()
        cells = self._nodes_by_grid_cell(bridge_max)

        for node in list(self._graph.nodes()):
            base_east, base_north = self._grid_cell(node, bridge_max)
            for delta_east in (-1, 0, 1):
                for delta_north in (-1, 0, 1):
                    cell = (base_east + delta_east, base_north + delta_north)
                    for other in cells.get(cell, ()):
                        if other <= node or subnetwork_of[node] == subnetwork_of[other]:
                            continue
                        self._bridge_if_close(node, other, bridge_max)

    def _bridge_if_close(self, node: str, other: str, bridge_max: float) -> None:
        gap = distance(self._node_point[node], self._node_point[other])
        if gap > bridge_max or frozenset((node, other)) in self._index:
            return
        low, high = sorted((node, other))
        self._register((low, high), [self._node_point[low], self._node_point[high]])
        self._graph.add_edge(node, other, weight=gap)

    def nodes_with_tracks(self) -> list[str]:
        return [node for node in self._graph if self._graph.degree(node) > 0]

    def subnetwork_count(self) -> int:
        return nx.number_connected_components(self._graph)

    def edge_index_between(self, node: str, other_node: str) -> int:
        return self._index[frozenset((node, other_node))]

    def path_length_metres(self, edge_path: list[int]) -> float:
        return sum(self._lengths[abs(edge) - 1] for edge in edge_path)

    def edge_path_between(self, from_node: str, to_node: str) -> list[int] | None:
        try:
            hops: list[str] = nx.shortest_path(
                self._graph, from_node, to_node, weight="weight"
            )
        except (nx.NetworkXNoPath, nx.NodeNotFound):
            return None
        signed: list[int] = []
        for current, following in zip(hops, hops[1:], strict=False):
            index = self._index[frozenset((current, following))]
            forward = self._endpoints[index][0] == current
            signed.append((index + 1) if forward else -(index + 1))
        return signed

    def append_straight_edge(self, start: Point, end: Point) -> int:
        self.polylines.append([start, end])
        self._endpoints.append(("", ""))
        self._lengths.append(distance(start, end))
        return len(self.polylines)  # 1-based forward index
