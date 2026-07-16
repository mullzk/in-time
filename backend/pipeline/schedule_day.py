"""Assembles a service day into a ScheduleDay: routes each trip's legs over the
rail network and collects the stations it touches."""

from collections import Counter
from dataclasses import dataclass
from datetime import date
from pathlib import Path

from pipeline.gtfs import active_rail_trips, stop_sequences
from pipeline.railnet import Point, RailGraph, RailRouter
from pipeline.schedule_blob import Event, ScheduleDay, Trip


@dataclass
class StationEntry:
    didok: int
    name: str


@dataclass
class NamedStraight:
    from_name: str
    to_name: str
    distance_km: float


@dataclass
class ScheduleBuild:
    day: ScheduleDay
    stations: list[StationEntry]
    method_counts: dict[str, int]
    straight_fallbacks: list[NamedStraight]


class _StationCatalog:
    def __init__(self, rail_graph: RailGraph) -> None:
        self._rail_graph = rail_graph
        self._index: dict[int, int] = {}
        self.coordinates: list[Point] = []
        self.entries: list[StationEntry] = []

    def index_of(self, didok: int) -> int:
        if didok not in self._index:
            node = self._rail_graph.didok_to_node[didok]
            self._index[didok] = len(self.coordinates)
            self.coordinates.append(self._rail_graph.node_point[node])
            self.entries.append(StationEntry(didok, self.name_of(didok)))
        return self._index[didok]

    def name_of(self, didok: int) -> str:
        node = self._rail_graph.didok_to_node.get(didok)
        if node is None:
            return str(didok)
        return self._rail_graph.node_name.get(node, str(didok))


def build_schedule_day(
    gtfs_dir: Path, rail_graph: RailGraph, service_date: date
) -> ScheduleBuild:
    categories = active_rail_trips(gtfs_dir, service_date)
    sequences = stop_sequences(gtfs_dir, set(categories))
    routable = rail_graph.didok_to_node

    kept: dict[str, list[tuple[int, int, int]]] = {}
    pairs: set[tuple[int, int]] = set()
    for trip_id in categories:
        calls = [
            (call.didok, call.arr, call.dep)
            for call in sequences.get(trip_id, [])
            if call.didok in routable
        ]
        if len(calls) < 2:
            continue
        kept[trip_id] = calls
        for (didok, _, _), (next_didok, _, _) in zip(calls, calls[1:], strict=False):
            pairs.add((didok, next_didok))

    router = RailRouter(rail_graph)
    routed = router.route_pairs(pairs)

    catalog = _StationCatalog(rail_graph)
    trips: list[Trip] = []
    for trip_id, calls in kept.items():
        events: list[Event] = []
        for position, (didok, arr, dep) in enumerate(calls):
            leg_edges: list[int] = []
            if position < len(calls) - 1:
                leg = routed.get((didok, calls[position + 1][0]))
                leg_edges = leg.signed_path if leg is not None else []
            events.append(Event(catalog.index_of(didok), arr, dep, leg_edges))
        trips.append(Trip(category=categories[trip_id], events=events))

    day = ScheduleDay(
        service_date=service_date,
        stations=catalog.coordinates,
        edges=router.edges,
        trips=trips,
    )
    method_counts = dict(Counter(leg.method for leg in routed.values()))
    straight = [
        NamedStraight(
            catalog.name_of(fallback.from_didok),
            catalog.name_of(fallback.to_didok),
            fallback.distance_metres / 1000,
        )
        for fallback in router.straight_fallbacks(routed)
    ]
    return ScheduleBuild(day, catalog.entries, method_counts, straight)
