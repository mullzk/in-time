"""Planar geometry helpers in LV95 metres."""

import math

from shapely.geometry import LineString

Point = tuple[float, float]


def distance(first: Point, second: Point) -> float:
    return math.hypot(second[0] - first[0], second[1] - first[1])


def polyline_length(points: list[Point]) -> float:
    return sum(
        distance(point, next_point)
        for point, next_point in zip(points, points[1:], strict=False)
    )


def starting_nearest_to(points: list[Point], start: Point) -> list[Point]:
    if distance(points[-1], start) < distance(points[0], start):
        return list(reversed(points))
    return points


def simplify(points: list[Point], tolerance: float) -> list[Point]:
    line = LineString(points).simplify(tolerance, preserve_topology=False)
    coords = [(float(x), float(y)) for x, y in line.coords]
    return coords if len(coords) >= 2 else points
