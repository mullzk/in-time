"""Planar geometry helpers in LV95 metres."""

import math

from shapely.geometry import LineString

Point = tuple[float, float]


def distance(a: Point, b: Point) -> float:
    return math.hypot(b[0] - a[0], b[1] - a[1])


def polyline_length(points: list[Point]) -> float:
    return sum(distance(p, q) for p, q in zip(points, points[1:], strict=False))


def oriented(points: list[Point], start: Point) -> list[Point]:
    if distance(points[-1], start) < distance(points[0], start):
        return list(reversed(points))
    return points


def simplify(points: list[Point], tolerance: float) -> list[Point]:
    line = LineString(points).simplify(tolerance, preserve_topology=False)
    coords = [(float(x), float(y)) for x, y in line.coords]
    return coords if len(coords) >= 2 else points
