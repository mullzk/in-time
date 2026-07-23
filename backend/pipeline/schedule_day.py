"""Assembles a service day into a ScheduleBuild: routes each trip's legs over a
network and collects the stations it touches.

The assembly is mode-agnostic — it takes a router and a station source — so the
same code drives rail and tram over the BAV network and bus over the road
network. build_schedule_day wires the rail case."""

from collections import Counter
from collections.abc import Set
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import Protocol

from pipeline.frequency import (
    RegularEdges,
    frequency_mode_of_category,
    is_swiss_bpuic,
)
from pipeline.gtfs import StopCall, active_rail_trips, stop_sequences
from pipeline.network.rail import Point, RailGraph, RailRouter
from pipeline.network.router import NetworkRouter
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


class StationSource(Protocol):
    def location(self, station: int) -> Point: ...

    def name(self, station: int) -> str: ...


class RailStationSource:
    def __init__(self, rail_graph: RailGraph) -> None:
        self._rail_graph = rail_graph

    def location(self, station: int) -> Point:
        node = self._rail_graph.station_to_node[station]
        return self._rail_graph.node_point[node]

    def name(self, station: int) -> str:
        node = self._rail_graph.station_to_node.get(station)
        if node is None:
            return str(station)
        return self._rail_graph.node_name.get(node, str(station))


class _StationCatalog:
    def __init__(self, source: StationSource) -> None:
        self._source = source
        self._index: dict[int, int] = {}
        self.coordinates: list[Point] = []
        self.entries: list[StationEntry] = []

    def index_of(self, station: int) -> int:
        if station not in self._index:
            self._index[station] = len(self.coordinates)
            self.coordinates.append(self._source.location(station))
            self.entries.append(StationEntry(station, self._source.name(station)))
        return self._index[station]

    def name_of(self, station: int) -> str:
        return self._source.name(station)


def _kept_calls(
    sequence: list[StopCall], placeable: Set[int]
) -> list[tuple[int, int, int]]:
    return [
        (call.didok, call.arr, call.dep) for call in sequence if call.didok in placeable
    ]


def _is_irregular_trip(
    sequence: list[StopCall], category: int, regular_edges: RegularEdges
) -> bool:
    swiss_stations = [call.didok for call in sequence if is_swiss_bpuic(call.didok)]
    mode = frequency_mode_of_category(category)
    return not regular_edges.trip_is_regular(swiss_stations, mode)


def assemble_schedule_day(
    service_date: date,
    trips: dict[str, int],
    sequences: dict[str, list[StopCall]],
    router: NetworkRouter,
    source: StationSource,
    placeable: Set[int],
    regular_edges: RegularEdges | None = None,
) -> ScheduleBuild:
    kept: dict[str, list[tuple[int, int, int]]] = {}
    pairs: set[tuple[int, int]] = set()
    for trip_id, category in trips.items():
        sequence = sequences.get(trip_id, [])
        if regular_edges is not None and _is_irregular_trip(
            sequence, category, regular_edges
        ):
            continue
        calls = _kept_calls(sequence, placeable)
        if len(calls) < 2:
            continue
        kept[trip_id] = calls
        for (didok, _, _), (next_didok, _, _) in zip(calls, calls[1:], strict=False):
            pairs.add((didok, next_didok))

    routed = router.route(pairs)

    catalog = _StationCatalog(source)
    assembled: list[Trip] = []
    for trip_id, calls in kept.items():
        events: list[Event] = []
        for position, (didok, arr, dep) in enumerate(calls):
            leg_edges: list[int] = []
            if position < len(calls) - 1:
                leg = routed.get((didok, calls[position + 1][0]))
                leg_edges = leg.signed_path if leg is not None else []
            events.append(Event(catalog.index_of(didok), arr, dep, leg_edges))
        assembled.append(Trip(category=trips[trip_id], events=events))

    day = ScheduleDay(
        service_date=service_date,
        stations=catalog.coordinates,
        edges=router.edges,
        trips=assembled,
    )
    method_counts = dict(Counter(leg.method for leg in routed.values()))
    straight = [
        NamedStraight(
            catalog.name_of(fallback.from_key),
            catalog.name_of(fallback.to_key),
            fallback.distance_metres / 1000,
        )
        for fallback in router.straight_fallbacks(routed)
    ]
    return ScheduleBuild(day, catalog.entries, method_counts, straight)


def build_schedule_day(
    gtfs_dir: Path,
    rail_graph: RailGraph,
    service_date: date,
    regular_edges: RegularEdges | None = None,
) -> ScheduleBuild:
    trips = active_rail_trips(gtfs_dir, service_date)
    sequences = stop_sequences(gtfs_dir, set(trips))
    return assemble_schedule_day(
        service_date,
        trips,
        sequences,
        RailRouter(rail_graph),
        RailStationSource(rail_graph),
        set(rail_graph.station_to_node),
        regular_edges,
    )
