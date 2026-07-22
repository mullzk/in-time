"""The raw network: nodes with LV95 coordinates and edges with polyline
geometry, as read from a source before any deduplication or routing."""

from __future__ import annotations

from dataclasses import dataclass

import networkx as nx

from pipeline.network.geometry import Point, polyline_length

Segment = tuple[str, str, list[Point]]


@dataclass
class NetworkGraph:
    graph: nx.Graph[str]
    node_point: dict[str, Point]
    edge_points: dict[frozenset[str], list[Point]]
    node_name: dict[str, str]

    @classmethod
    def from_segments(
        cls,
        nodes: dict[str, Point],
        segments: list[Segment],
        node_name: dict[str, str] | None = None,
    ) -> NetworkGraph:
        graph: nx.Graph[str] = nx.Graph()
        graph.add_nodes_from(nodes)
        edge_points: dict[frozenset[str], list[Point]] = {}
        for first, second, points in segments:
            graph.add_edge(first, second, weight=polyline_length(points))
            edge_points[frozenset((first, second))] = points
        return cls(
            graph=graph,
            node_point=nodes,
            edge_points=edge_points,
            node_name=node_name or {},
        )
