"""Loads the swissTLM3D road network GDB into a NetworkGraph, keeping native LV95.

Only drivable classified roads are kept — the VERKEHRSBEDEUTUNG hierarchy
Hochleistungs-, Durchgangs- and Verbindungsstrasse — so footpaths, tracks and
unclassified ways are dropped. The road layer carries no node ids, so nodes are
synthesised at line endpoints, quantised so segments meeting at a point share a
node."""

from pathlib import Path

import geopandas as gpd
from shapely.geometry import LineString, MultiLineString
from shapely.geometry.base import BaseGeometry

from pipeline.network import NetworkGraph, Point, Segment

ROAD_LAYER = "TLM_STRASSE"
TRAFFIC_CLASS_FIELD = "VERKEHRSBEDEUTUNG"
DRIVABLE_TRAFFIC_CLASSES = frozenset({100, 200, 300})
_NODE_QUANTISE_METRES = 1.0

RoadSegment = tuple[int, list[Point]]


def _node_id(point: Point) -> str:
    east = round(point[0] / _NODE_QUANTISE_METRES)
    north = round(point[1] / _NODE_QUANTISE_METRES)
    return f"{east}:{north}"


def _drop_z(line: LineString) -> list[Point]:
    return [(float(vertex[0]), float(vertex[1])) for vertex in line.coords]


def _road_polylines(geometry: BaseGeometry) -> list[list[Point]]:
    if isinstance(geometry, MultiLineString):
        return [_drop_z(part) for part in geometry.geoms]
    if isinstance(geometry, LineString):
        return [_drop_z(geometry)]
    return []


def build_road_graph(segments: list[RoadSegment]) -> NetworkGraph:
    nodes: dict[str, Point] = {}
    graph_segments: list[Segment] = []
    for traffic_class, polyline in segments:
        if traffic_class not in DRIVABLE_TRAFFIC_CLASSES or len(polyline) < 2:
            continue
        start, end = polyline[0], polyline[-1]
        start_id, end_id = _node_id(start), _node_id(end)
        if start_id == end_id:
            continue
        nodes.setdefault(start_id, start)
        nodes.setdefault(end_id, end)
        graph_segments.append((start_id, end_id, polyline))
    return NetworkGraph.from_segments(nodes, graph_segments)


def load_road_graph(gdb_path: Path) -> NetworkGraph:
    classes = ",".join(str(code) for code in sorted(DRIVABLE_TRAFFIC_CLASSES))
    roads = gpd.read_file(
        gdb_path,
        layer=ROAD_LAYER,
        columns=[TRAFFIC_CLASS_FIELD],
        where=f"{TRAFFIC_CLASS_FIELD} IN ({classes})",
    )
    segments: list[RoadSegment] = []
    for traffic_class, geometry in zip(
        roads[TRAFFIC_CLASS_FIELD].tolist(), roads.geometry, strict=True
    ):
        if geometry is None:
            continue
        for polyline in _road_polylines(geometry):
            segments.append((int(traffic_class), polyline))
    return build_road_graph(segments)
