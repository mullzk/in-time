"""How a station attaches to the network: its anchor, a spatial grid over the
routable nodes, and the snapping that finds the node(s) a leg enters and leaves
the graph through."""

from __future__ import annotations

from dataclasses import dataclass

from pipeline.network.geometry import Point, distance
from pipeline.network.thresholds import RoutingThresholds

_GRID_CELL_METRES = 200.0


@dataclass
class StationAnchor:
    """Where a station sits, and (rail only) the node it already is.

    `network_node` lets a rail station enter the network at its own node; a road
    stop leaves it `None` and is snapped onto the nearest street node."""

    location: Point
    network_node: str | None


class SpatialGrid:
    """Buckets node points into square cells so nearest-node and radius queries
    touch only the cells near the query, not every node."""

    def __init__(self, node_point: dict[str, Point], cell_metres: float) -> None:
        self._node_point = node_point
        self._cell = cell_metres
        self._buckets: dict[tuple[int, int], list[str]] = {}
        for node, point in node_point.items():
            self._buckets.setdefault(self._cell_of(point), []).append(node)

    def _cell_of(self, point: Point) -> tuple[int, int]:
        return (int(point[0] // self._cell), int(point[1] // self._cell))

    def _ring_nodes(self, centre: tuple[int, int], ring: int) -> list[str]:
        east, north = centre
        if ring == 0:
            return self._buckets.get(centre, [])
        nodes: list[str] = []
        for delta_east in range(-ring, ring + 1):
            for delta_north in range(-ring, ring + 1):
                if max(abs(delta_east), abs(delta_north)) != ring:
                    continue
                nodes.extend(
                    self._buckets.get((east + delta_east, north + delta_north), [])
                )
        return nodes

    def nearest(self, point: Point, max_distance: float) -> str | None:
        centre = self._cell_of(point)
        best_node: str | None = None
        best = max_distance
        ring = 0
        max_ring = int(max_distance // self._cell) + 1
        while ring <= max_ring:
            for node in self._ring_nodes(centre, ring):
                span = distance(point, self._node_point[node])
                if span <= best:
                    best, best_node = span, node
            if best_node is not None and ring * self._cell >= best:
                break
            ring += 1
        return best_node

    def within(self, point: Point, radius: float) -> list[str]:
        east, north = self._cell_of(point)
        reach = int(radius // self._cell) + 1
        found: list[str] = []
        for delta_east in range(-reach, reach + 1):
            for delta_north in range(-reach, reach + 1):
                bucket = self._buckets.get((east + delta_east, north + delta_north), [])
                for node in bucket:
                    if distance(point, self._node_point[node]) <= radius:
                        found.append(node)
        return found


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
        self._routable_set = set(routable_nodes)
        self._grid = SpatialGrid(
            {node: node_point[node] for node in routable_nodes}, _GRID_CELL_METRES
        )
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
        return self._grid.nearest(anchor.location, self._max_entry)

    def entry_candidates(self, station: int) -> list[str]:
        if station not in self._candidate_cache:
            self._candidate_cache[station] = self._resolve_candidates(station)
        return self._candidate_cache[station]

    def _resolve_candidates(self, station: int) -> list[str]:
        anchor = self._anchors.get(station)
        if anchor is None:
            return []
        return self._grid.within(anchor.location, self._candidate_radius)
