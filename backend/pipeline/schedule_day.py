"""Assembles a service day into a ScheduleBuild and collects the stations it
touches.

The build_* entry points read the GTFS source from gtfs_dir and delegate; the
assemble_* functions are pure and work on already-loaded trips and sequences.

Rail and tram are routed over the BAV network (assemble_schedule_day); buses are
drawn as straight lines between their stops (assemble_straight_line_day), so a
bus leg carries no edges. build_day_builds produces both.

The frequency filter treats the modes differently. A rail or tram trip drops as
soon as one of its edges is irregular. A bus trip is kept as long as it has any
regular edge: an urban line whose city-centre routing legitimately varies day to
day would otherwise vanish whole, and its rare segments cost nothing extra to
show — they are the same straight lines every bus leg already is."""

from collections import Counter
from collections.abc import Set
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import Protocol

from pipeline.bus_stops import BusStop
from pipeline.frequency import (
    RegularEdges,
    frequency_mode_of_category,
)
from pipeline.gtfs import (
    CATEGORY_BUS,
    CATEGORY_TRAM,
    RAIL_CATEGORIES,
    StopCall,
    active_rail_trips,
    active_trips,
    is_swiss_bpuic,
    stop_sequences,
)
from pipeline.network.rail import Point, RailGraph, RailRouter
from pipeline.schedule_blob import Event, ScheduleDay, Trip

_BAV_CATEGORIES = RAIL_CATEGORIES | {CATEGORY_TRAM}


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


class BusStationSource:
    def __init__(self, bus_stops: dict[int, BusStop]) -> None:
        self._bus_stops = bus_stops

    def location(self, station: int) -> Point:
        return self._bus_stops[station].location

    def name(self, station: int) -> str:
        stop = self._bus_stops.get(station)
        return stop.name if stop is not None else str(station)


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


def _swiss_stations_and_mode(
    sequence: list[StopCall], category: int
) -> tuple[list[int], int]:
    swiss_stations = [call.didok for call in sequence if is_swiss_bpuic(call.didok)]
    return swiss_stations, frequency_mode_of_category(category)


def _rail_trip_is_droppable(
    sequence: list[StopCall], category: int, regular_edges: RegularEdges
) -> bool:
    swiss_stations, mode = _swiss_stations_and_mode(sequence, category)
    return not regular_edges.trip_is_regular(swiss_stations, mode)


def _bus_trip_is_droppable(
    sequence: list[StopCall], category: int, regular_edges: RegularEdges
) -> bool:
    swiss_stations, mode = _swiss_stations_and_mode(sequence, category)
    return not regular_edges.trip_has_regular_edge(swiss_stations, mode)


def assemble_schedule_day(
    service_date: date,
    trips: dict[str, int],
    sequences: dict[str, list[StopCall]],
    router: RailRouter,
    source: StationSource,
    placeable: Set[int],
    regular_edges: RegularEdges | None = None,
) -> ScheduleBuild:
    kept: dict[str, list[tuple[int, int, int]]] = {}
    pairs: set[tuple[int, int]] = set()
    for trip_id, category in trips.items():
        sequence = sequences.get(trip_id, [])
        if regular_edges is not None and _rail_trip_is_droppable(
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


def _rail_inputs(
    rail_graph: RailGraph,
) -> tuple[RailRouter, RailStationSource, set[int]]:
    return (
        RailRouter(rail_graph),
        RailStationSource(rail_graph),
        set(rail_graph.station_to_node),
    )


def build_schedule_day(
    gtfs_dir: Path,
    rail_graph: RailGraph,
    service_date: date,
    regular_edges: RegularEdges | None = None,
) -> ScheduleBuild:
    trips = active_rail_trips(gtfs_dir, service_date)
    sequences = stop_sequences(gtfs_dir, set(trips))
    router, source, placeable = _rail_inputs(rail_graph)
    return assemble_schedule_day(
        service_date,
        trips,
        sequences,
        router,
        source,
        placeable,
        regular_edges,
    )


@dataclass
class DayBuilds:
    bav: ScheduleBuild
    road: ScheduleBuild


def assemble_straight_line_day(
    service_date: date,
    trips: dict[str, int],
    sequences: dict[str, list[StopCall]],
    bus_stops: dict[int, BusStop],
    regular_edges: RegularEdges,
) -> ScheduleBuild:
    catalog = _StationCatalog(BusStationSource(bus_stops))
    placeable = set(bus_stops)
    assembled: list[Trip] = []
    for trip_id, category in trips.items():
        sequence = sequences.get(trip_id, [])
        if _bus_trip_is_droppable(sequence, category, regular_edges):
            continue
        calls = _kept_calls(sequence, placeable)
        if len(calls) < 2:
            continue
        events = [
            Event(catalog.index_of(didok), arr, dep, []) for didok, arr, dep in calls
        ]
        assembled.append(Trip(category=category, events=events))
    day = ScheduleDay(
        service_date=service_date,
        stations=catalog.coordinates,
        edges=[],
        trips=assembled,
    )
    return ScheduleBuild(day, catalog.entries, {}, [])


def build_day_builds(
    gtfs_dir: Path,
    rail_graph: RailGraph,
    bus_stops: dict[int, BusStop],
    regular_edges: RegularEdges,
    service_date: date,
) -> DayBuilds:
    trips = active_trips(gtfs_dir, service_date)
    sequences = stop_sequences(gtfs_dir, set(trips))
    bav_trips = {
        trip: category
        for trip, category in trips.items()
        if category in _BAV_CATEGORIES
    }
    bus_trips = {
        trip: category for trip, category in trips.items() if category == CATEGORY_BUS
    }

    router, source, placeable = _rail_inputs(rail_graph)
    bav = assemble_schedule_day(
        service_date,
        bav_trips,
        sequences,
        router,
        source,
        placeable,
        regular_edges,
    )
    road = assemble_straight_line_day(
        service_date, bus_trips, sequences, bus_stops, regular_edges
    )
    return DayBuilds(bav=bav, road=road)
