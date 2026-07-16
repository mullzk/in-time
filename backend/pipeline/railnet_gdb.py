"""Loads the BAV rail network GDB into a RailGraph, keeping native LV95."""

import math
from pathlib import Path

import geopandas as gpd
from shapely.geometry import LineString, MultiLineString
from shapely.geometry import Point as ShapelyPoint
from shapely.geometry.base import BaseGeometry

from pipeline.railnet import Point, RailGraph


def _line_coords(line: LineString) -> list[Point]:
    return [(float(point[0]), float(point[1])) for point in line.coords]


def _vertices(geometry: BaseGeometry) -> list[Point]:
    if isinstance(geometry, MultiLineString):
        coords: list[Point] = []
        for part in geometry.geoms:
            coords.extend(_line_coords(part))
        return coords
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


def load_rail_graph(gdb_path: Path) -> RailGraph:
    nodes = gpd.read_file(gdb_path, layer="Netzknoten")
    segments = gpd.read_file(gdb_path, layer="Netzsegment")

    node_ids = [str(value) for value in nodes["xtf_id"].tolist()]
    node_point: dict[str, Point] = {
        node_id: _node_xy(geometry)
        for node_id, geometry in zip(node_ids, nodes.geometry, strict=True)
    }
    node_name: dict[str, str] = {
        node_id: str(name)
        for node_id, name in zip(
            node_ids, nodes["Betriebspunkt_Name"].tolist(), strict=True
        )
        if name
    }

    didok_to_node: dict[int, str] = {}
    numbers = nodes["Betriebspunkt_Nummer"].tolist()
    for node_id, number in zip(node_ids, numbers, strict=True):
        didok = _to_didok(number)
        if didok is not None and didok not in didok_to_node:
            didok_to_node[didok] = node_id

    starts = [str(value) for value in segments["rAnfangsknoten"].tolist()]
    ends = [str(value) for value in segments["rEndknoten"].tolist()]
    geometries = list(segments.geometry)

    edge_points: dict[frozenset[str], list[Point]] = {}
    segment_list: list[tuple[str, str, list[Point]]] = []
    for start, end, geometry in zip(starts, ends, geometries, strict=True):
        if start not in node_point or end not in node_point or geometry is None:
            continue
        key = frozenset((start, end))
        if key in edge_points:
            continue
        points = _vertices(geometry)
        edge_points[key] = points
        segment_list.append((start, end, points))

    return RailGraph.from_segments(
        nodes=node_point,
        segments=segment_list,
        didok_to_node=didok_to_node,
        node_name=node_name,
    )
