"""Assembles a service day into a ScheduleBuild and collects the stations it
touches.

build_schedule_day reads the GTFS source from gtfs_dir and delegates to the
assemble_* functions, which are pure and work on already-loaded trips and
sequences.

Two vocabularies meet here. The input side speaks modes, where rail excludes
tram (RAIL_CATEGORIES, STATION_MODE_RAIL), so the assemble_* functions split
into railbound (rail and tram) and bus. The output side speaks networks, where
rail means track-bound and therefore carries tram, so the two builds are named
rail and road after the blobs they become.

Railbound trips are routed over the BAV network; buses are drawn as straight
lines between their stops, so a bus leg carries no edges.

The frequency filter treats the modes differently. A railbound trip drops as
soon as one of its connections is irregular. A bus trip is kept as long as it
has any regular connection: an urban line whose city-centre routing legitimately
varies day to day would otherwise vanish whole, and its rare segments cost
nothing extra to show — they are the same straight lines every bus leg already
is."""

from collections import Counter
from collections.abc import Callable, Set
from dataclasses import dataclass, field
from datetime import date
from functools import partial
from pathlib import Path
from typing import Protocol

from pipeline.bus_stops import BusStop
from pipeline.frequency import (
    RegularConnections,
    frequency_mode_of_category,
)
from pipeline.gtfs import (
    CATEGORY_BUS,
    CATEGORY_TRAM,
    RAIL_CATEGORIES,
    StopCall,
    active_trips,
    is_swiss_didok,
    stop_sequences,
)
from pipeline.network import Point, RailGraph, RailRouter, RoutedLeg
from pipeline.schedule_blob import Event, ScheduleDay, Trip

_RAILBOUND_CATEGORIES = RAIL_CATEGORIES | {CATEGORY_TRAM}

STATION_MODE_RAIL = "rail"
STATION_MODE_TRAM = "tram"
STATION_MODE_BUS = "bus"
STATION_MODE_ORDER = (STATION_MODE_RAIL, STATION_MODE_TRAM, STATION_MODE_BUS)


def station_mode_of_category(category: int) -> str:
    if category == CATEGORY_TRAM:
        return STATION_MODE_TRAM
    if category == CATEGORY_BUS:
        return STATION_MODE_BUS
    return STATION_MODE_RAIL


def ordered_station_modes(modes: Set[str]) -> list[str]:
    return [mode for mode in STATION_MODE_ORDER if mode in modes]


@dataclass
class StationEntry:
    didok: int
    name: str
    modes: set[str] = field(default_factory=set)


@dataclass
class NamedStraightFallback:
    from_name: str
    to_name: str
    distance_km: float


@dataclass
class ScheduleBuild:
    day: ScheduleDay
    stations: list[StationEntry]
    method_counts: dict[str, int]
    straight_fallbacks: list[NamedStraightFallback]


@dataclass
class DayBuilds:
    rail: ScheduleBuild
    road: ScheduleBuild


class StationSource(Protocol):
    def location(self, didok: int) -> Point: ...

    def name(self, didok: int) -> str: ...


class RailStationSource:
    def __init__(self, rail_graph: RailGraph) -> None:
        self._rail_graph = rail_graph

    def location(self, didok: int) -> Point:
        node = self._rail_graph.station_to_node[didok]
        return self._rail_graph.node_point[node]

    def name(self, didok: int) -> str:
        node = self._rail_graph.station_to_node.get(didok)
        if node is None:
            return str(didok)
        return self._rail_graph.node_name.get(node, str(didok))


class BusStationSource:
    def __init__(self, bus_stops: dict[int, BusStop]) -> None:
        self._bus_stops = bus_stops

    def location(self, didok: int) -> Point:
        return self._bus_stops[didok].location

    def name(self, didok: int) -> str:
        stop = self._bus_stops.get(didok)
        return stop.name if stop is not None else str(didok)


class _StationCatalog:
    """Hands out the consecutive blob indices stations are addressed by, and
    collects which modes serve each of them."""

    def __init__(self, source: StationSource) -> None:
        self._source = source
        self._index: dict[int, int] = {}
        self.coordinates: list[Point] = []
        self.entries: list[StationEntry] = []

    def register(self, didok: int, category: int) -> int:
        if didok not in self._index:
            self._index[didok] = len(self.coordinates)
            self.coordinates.append(self._source.location(didok))
            self.entries.append(StationEntry(didok, self._source.name(didok)))
        self.entries[self._index[didok]].modes.add(station_mode_of_category(category))
        return self._index[didok]

    def name_of(self, didok: int) -> str:
        return self._source.name(didok)


def _calls_at_locatable_stations(
    sequence: list[StopCall], stations_with_known_location: Set[int]
) -> list[StopCall]:
    return [call for call in sequence if call.didok in stations_with_known_location]


def _swiss_stations_and_mode(
    sequence: list[StopCall], category: int
) -> tuple[list[int], int]:
    swiss_stations = [call.didok for call in sequence if is_swiss_didok(call.didok)]
    return swiss_stations, frequency_mode_of_category(category)


def _railbound_trip_is_droppable(
    sequence: list[StopCall], category: int, regular_connections: RegularConnections
) -> bool:
    swiss_stations, mode = _swiss_stations_and_mode(sequence, category)
    return not regular_connections.trip_is_regular(swiss_stations, mode)


def _bus_trip_is_droppable(
    sequence: list[StopCall], category: int, regular_connections: RegularConnections
) -> bool:
    swiss_stations, mode = _swiss_stations_and_mode(sequence, category)
    return not regular_connections.trip_has_regular_connection(swiss_stations, mode)


def _kept_calls_by_trip(
    trips: dict[str, int],
    sequences: dict[str, list[StopCall]],
    stations_with_known_location: Set[int],
    trip_is_droppable: Callable[[list[StopCall], int], bool],
) -> dict[str, list[StopCall]]:
    kept: dict[str, list[StopCall]] = {}
    for trip_id, category in trips.items():
        sequence = sequences.get(trip_id, [])
        if trip_is_droppable(sequence, category):
            continue
        calls = _calls_at_locatable_stations(sequence, stations_with_known_location)
        if len(calls) >= 2:
            kept[trip_id] = calls
    return kept


def _connections_of(kept_calls: dict[str, list[StopCall]]) -> set[tuple[int, int]]:
    return {
        (call.didok, next_call.didok)
        for calls in kept_calls.values()
        for call, next_call in zip(calls, calls[1:], strict=False)
    }


def _leg_edges_between(
    routed: dict[tuple[int, int], RoutedLeg], call: StopCall, next_call: StopCall
) -> list[int]:
    leg = routed.get((call.didok, next_call.didok))
    return leg.signed_path if leg is not None else []


def _outgoing_leg_edges(
    calls: list[StopCall], routed: dict[tuple[int, int], RoutedLeg]
) -> list[list[int]]:
    edges_between_calls = [
        _leg_edges_between(routed, call, next_call)
        for call, next_call in zip(calls, calls[1:], strict=False)
    ]
    return [*edges_between_calls, []]


def _routed_events(
    calls: list[StopCall],
    category: int,
    routed: dict[tuple[int, int], RoutedLeg],
    catalog: _StationCatalog,
) -> list[Event]:
    return [
        Event(
            catalog.register(call.didok, category),
            call.arrival,
            call.departure,
            leg_edges,
        )
        for call, leg_edges in zip(
            calls, _outgoing_leg_edges(calls, routed), strict=True
        )
    ]


def _geometry_free_events(
    calls: list[StopCall], category: int, catalog: _StationCatalog
) -> list[Event]:
    return [
        Event(catalog.register(call.didok, category), call.arrival, call.departure, [])
        for call in calls
    ]


def _named_straight_fallbacks(
    router: RailRouter,
    routed: dict[tuple[int, int], RoutedLeg],
    catalog: _StationCatalog,
) -> list[NamedStraightFallback]:
    return [
        NamedStraightFallback(
            catalog.name_of(fallback.from_didok),
            catalog.name_of(fallback.to_didok),
            fallback.distance_metres / 1000,
        )
        for fallback in router.straight_fallbacks(routed)
    ]


def assemble_railbound_schedule_day(
    service_date: date,
    trips: dict[str, int],
    sequences: dict[str, list[StopCall]],
    router: RailRouter,
    source: StationSource,
    stations_with_known_location: Set[int],
    regular_connections: RegularConnections,
) -> ScheduleBuild:
    kept_calls = _kept_calls_by_trip(
        trips,
        sequences,
        stations_with_known_location,
        partial(_railbound_trip_is_droppable, regular_connections=regular_connections),
    )
    routed = router.route(_connections_of(kept_calls))

    catalog = _StationCatalog(source)
    assembled = [
        Trip(
            category=trips[trip_id],
            events=_routed_events(calls, trips[trip_id], routed, catalog),
        )
        for trip_id, calls in kept_calls.items()
    ]

    day = ScheduleDay(
        service_date=service_date,
        stations=catalog.coordinates,
        edges=router.edges,
        trips=assembled,
    )
    return ScheduleBuild(
        day,
        catalog.entries,
        dict(Counter(leg.method for leg in routed.values())),
        _named_straight_fallbacks(router, routed, catalog),
    )


def assemble_bus_schedule_day(
    service_date: date,
    trips: dict[str, int],
    sequences: dict[str, list[StopCall]],
    bus_stops: dict[int, BusStop],
    regular_connections: RegularConnections,
) -> ScheduleBuild:
    kept_calls = _kept_calls_by_trip(
        trips,
        sequences,
        set(bus_stops),
        partial(_bus_trip_is_droppable, regular_connections=regular_connections),
    )

    catalog = _StationCatalog(BusStationSource(bus_stops))
    assembled = [
        Trip(
            category=trips[trip_id],
            events=_geometry_free_events(calls, trips[trip_id], catalog),
        )
        for trip_id, calls in kept_calls.items()
    ]
    day = ScheduleDay(
        service_date=service_date,
        stations=catalog.coordinates,
        edges=[],
        trips=assembled,
    )
    return ScheduleBuild(day, catalog.entries, {}, [])


def build_schedule_day(
    gtfs_dir: Path,
    rail_graph: RailGraph,
    bus_stops: dict[int, BusStop],
    regular_connections: RegularConnections,
    service_date: date,
) -> DayBuilds:
    trips = active_trips(gtfs_dir, service_date)
    sequences = stop_sequences(gtfs_dir, set(trips))
    rail_trips = {
        trip: category
        for trip, category in trips.items()
        if category in _RAILBOUND_CATEGORIES
    }
    bus_trips = {
        trip: category for trip, category in trips.items() if category == CATEGORY_BUS
    }

    rail = assemble_railbound_schedule_day(
        service_date,
        rail_trips,
        sequences,
        RailRouter(rail_graph),
        RailStationSource(rail_graph),
        set(rail_graph.station_to_node),
        regular_connections,
    )
    road = assemble_bus_schedule_day(
        service_date, bus_trips, sequences, bus_stops, regular_connections
    )
    return DayBuilds(rail=rail, road=road)
