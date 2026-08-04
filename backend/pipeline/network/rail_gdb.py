"""Loads the BAV rail network GDB into a RailGraph, keeping native LV95."""

import math
from pathlib import Path

import geopandas as gpd
from shapely import line_merge
from shapely.geometry import LineString, MultiLineString
from shapely.geometry import Point as ShapelyPoint
from shapely.geometry.base import BaseGeometry

from pipeline.network.geometry import Point, polyline_length
from pipeline.network.rail import RailGraph


def _line_coords(line: LineString) -> list[Point]:
    return [(float(point[0]), float(point[1])) for point in line.coords]


def _vertices(geometry: BaseGeometry) -> list[Point]:
    if isinstance(geometry, MultiLineString):
        stitched_geometry = line_merge(geometry)
        if isinstance(stitched_geometry, LineString):
            return _line_coords(stitched_geometry)
        # Parts don't share endpoints (a real gap in the segment):
        # nothing better than best-effort concatenation.
        vertices: list[Point] = []
        for disconnected_part in stitched_geometry.geoms:
            vertices.extend(_vertices(disconnected_part))
        return vertices
    if isinstance(geometry, LineString):
        return _line_coords(geometry)
    return []


def _node_xy(geometry: BaseGeometry) -> Point:
    if not isinstance(geometry, ShapelyPoint):
        raise TypeError(f"Netzknoten geometry is not a Point: {geometry.geom_type}")
    return (float(geometry.x), float(geometry.y))


def _to_didok(value: object) -> int | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        number = value
    elif isinstance(value, float):
        if math.isnan(value):
            return None
        number = int(value)
    elif isinstance(value, str) and value.strip().isdigit():
        number = int(value)
    else:
        return None
    return number if number > 0 else None


def _node_points(
    node_ids: list[str], geometries: list[BaseGeometry]
) -> dict[str, Point]:
    return {
        node_id: _node_xy(geometry)
        for node_id, geometry in zip(node_ids, geometries, strict=True)
    }


def _node_names(node_ids: list[str], names: list[object]) -> dict[str, str]:
    return {
        node_id: str(name)
        for node_id, name in zip(node_ids, names, strict=True)
        if name
    }


def _node_by_station_didok(
    node_ids: list[str], station_numbers: list[object]
) -> dict[int, str]:
    station_to_node: dict[int, str] = {}
    for node_id, number in zip(node_ids, station_numbers, strict=True):
        didok = _to_didok(number)
        if didok is not None and didok not in station_to_node:
            station_to_node[didok] = node_id
    return station_to_node


def _deduplicated_segments(
    starts: list[str],
    ends: list[str],
    geometries: list[BaseGeometry | None],
    node_point: dict[str, Point],
) -> list[tuple[str, str, list[Point]]]:
    seen: set[frozenset[str]] = set()
    segments: list[tuple[str, str, list[Point]]] = []
    for start, end, geometry in zip(starts, ends, geometries, strict=True):
        if start not in node_point or end not in node_point or geometry is None:
            continue
        key = frozenset((start, end))
        if key in seen:
            continue
        seen.add(key)
        segments.append((start, end, _segment_points(geometry, node_point, start, end)))
    return segments


def _segment_points(
    geometry: BaseGeometry, node_point: dict[str, Point], start: str, end: str
) -> list[Point]:
    points = _vertices(geometry)
    if len(points) < 2 or polyline_length(points) == 0.0:
        return [node_point[start], node_point[end]]
    return points


def load_rail_graph(gdb_path: Path) -> RailGraph:
    nodes = gpd.read_file(gdb_path, layer="Netzknoten")
    segments = gpd.read_file(gdb_path, layer="Netzsegment")

    node_ids = [str(value) for value in nodes["xtf_id"].tolist()]
    node_point = _node_points(node_ids, list(nodes.geometry))

    return RailGraph.from_rail_segments(
        nodes=node_point,
        segments=_deduplicated_segments(
            [str(value) for value in segments["rAnfangsknoten"].tolist()],
            [str(value) for value in segments["rEndknoten"].tolist()],
            list(segments.geometry),
            node_point,
        ),
        station_to_node=_node_by_station_didok(
            node_ids, nodes["Betriebspunkt_Nummer"].tolist()
        ),
        node_name=_node_names(node_ids, nodes["Betriebspunkt_Name"].tolist()),
    )
