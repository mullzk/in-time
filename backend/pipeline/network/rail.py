"""Rail specialisation of the generic network router: a rail station is a
network node (its DiDok maps to it), so legs route from that node directly and
are keyed by DiDok."""

from __future__ import annotations

from dataclasses import dataclass

from pipeline.network import (
    DEFAULT_THRESHOLDS,
    NetworkGraph,
    NetworkRouter,
    Point,
    RoutingThresholds,
    Segment,
    anchor_stations_at_own_nodes,
)

__all__ = ["Point", "RailGraph", "RailRouter"]


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


class RailRouter(NetworkRouter):
    def __init__(
        self,
        rail_graph: RailGraph,
        thresholds: RoutingThresholds = DEFAULT_THRESHOLDS,
    ) -> None:
        anchors = anchor_stations_at_own_nodes(
            rail_graph.node_point, rail_graph.station_to_node
        )
        super().__init__(rail_graph, anchors, thresholds)
