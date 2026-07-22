"""How a station attaches to the network: its anchor, and the snapping that
finds the node(s) a leg enters and leaves the graph through."""

from __future__ import annotations

from dataclasses import dataclass

from pipeline.network.geometry import Point, distance
from pipeline.network.thresholds import RoutingThresholds


@dataclass
class StationAnchor:
    """Where a station sits, and (rail only) the node it already is.

    `network_node` lets a rail station enter the network at its own node; a road
    stop leaves it `None` and is snapped onto the nearest street node."""

    location: Point
    network_node: str | None


def anchor_stations_at_own_nodes(
    node_point: dict[str, Point], station_to_node: dict[int, str]
) -> dict[int, StationAnchor]:
    """Each rail station already sits on a network node, so it is anchored there
    directly (no snapping)."""
    return {
        station: StationAnchor(location=node_point[node], network_node=node)
        for station, node in station_to_node.items()
    }


class NetworkAccess:
    """Finds the node(s) a station enters the graph through. A station with a
    `network_node` enters there; otherwise its location is snapped to the
    nearest routable node within `max_entry_metres`, with the nodes inside
    `entry_candidate_radius_metres` kept as alternatives for a wider search."""

    def __init__(
        self,
        anchors: dict[int, StationAnchor],
        node_point: dict[str, Point],
        routable_nodes: list[str],
        thresholds: RoutingThresholds,
    ) -> None:
        self._anchors = anchors
        self._node_point = node_point
        self._routable = routable_nodes
        self._routable_set = set(routable_nodes)
        self._max_entry = thresholds.max_entry_metres
        self._candidate_radius = thresholds.entry_candidate_radius_metres
        self._entry_cache: dict[int, str | None] = {}
        self._candidate_cache: dict[int, list[str]] = {}

    def location(self, station: int) -> Point | None:
        anchor = self._anchors.get(station)
        return anchor.location if anchor is not None else None

    def entry_node(self, station: int) -> str | None:
        if station not in self._entry_cache:
            self._entry_cache[station] = self._resolve_entry(station)
        return self._entry_cache[station]

    def _resolve_entry(self, station: int) -> str | None:
        anchor = self._anchors.get(station)
        if anchor is None:
            return None
        own = anchor.network_node
        if own is not None and own in self._routable_set:
            return own
        nearest = min(
            self._routable,
            key=lambda node: distance(anchor.location, self._node_point[node]),
            default=None,
        )
        if nearest is None:
            return None
        reachable = distance(anchor.location, self._node_point[nearest])
        return nearest if reachable <= self._max_entry else None

    def entry_candidates(self, station: int) -> list[str]:
        if station not in self._candidate_cache:
            self._candidate_cache[station] = self._resolve_candidates(station)
        return self._candidate_cache[station]

    def _resolve_candidates(self, station: int) -> list[str]:
        anchor = self._anchors.get(station)
        if anchor is None:
            return []
        return [
            node
            for node in self._routable
            if distance(anchor.location, self._node_point[node])
            <= self._candidate_radius
        ]
