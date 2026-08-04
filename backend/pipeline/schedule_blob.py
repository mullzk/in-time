"""Binary schedule blob v1 (ITSB): columnar, little-endian.

The rail network geometry is stored once as a shared, deduplicated edge list;
every trip is a reference — a path of signed 1-based edge indices plus per-stop
schedule times.
"""

import array
import struct
import sys
from dataclasses import dataclass
from datetime import date
from enum import IntEnum

MAGIC = b"ITSB"
VERSION = 1
COORD_SCALE = 1
LV95_ORIGIN_EAST = 2_480_000
LV95_ORIGIN_NORTH = 1_070_000

_HEADER_FORMAT = "<4sHHIIIHHIIIIIIIIIIII4I"
HEADER_SIZE = struct.calcsize(_HEADER_FORMAT)


class NetworkType(IntEnum):
    RAIL = 1  # rail and tram, routed over the rail network
    ROAD = 2  # buses, drawn as straight lines between their stops


@dataclass
class Event:
    station: int
    arrival: int
    departure: int
    leg_edges: list[int]


@dataclass
class Trip:
    category: int
    events: list[Event]


@dataclass
class ScheduleDay:
    service_date: date
    stations: list[tuple[float, float]]
    edges: list[list[tuple[float, float]]]
    trips: list[Trip]


@dataclass
class ScheduleHeader:
    version: int
    network_type: int
    service_date: int
    coord_origin_east: int
    coord_origin_north: int
    coord_scale: int
    station_count: int
    edge_count: int
    point_count: int
    trip_count: int
    event_count: int
    path_count: int
    offset_stations: int
    offset_edges: int
    offset_points: int
    offset_trips: int
    offset_events: int
    offset_path: int


def _column(typecode: str, values: list[int]) -> bytes:
    column = array.array(typecode, values)
    if sys.byteorder == "big":
        column.byteswap()
    return column.tobytes()


def _pad_to_four(block: bytes) -> bytes:
    remainder = len(block) % 4
    return block if remainder == 0 else block + b"\x00" * (4 - remainder)


def _offset_east(value: float) -> int:
    return round(value - LV95_ORIGIN_EAST)


def _offset_north(value: float) -> int:
    return round(value - LV95_ORIGIN_NORTH)


@dataclass
class _EdgeGeometryColumns:
    point_start: list[int]
    point_len: list[int]
    point_east: list[int]
    point_north: list[int]


@dataclass
class _TripColumns:
    category: list[int]
    first_departure: list[int]
    last_arrival: list[int]
    event_start: list[int]
    event_len: list[int]
    path_start: list[int]
    path_len: list[int]
    event_station: list[int]
    event_arrival: list[int]
    event_departure: list[int]
    event_leg_edge_count: list[int]
    path: list[int]


def _station_columns(
    stations: list[tuple[float, float]],
) -> tuple[list[int], list[int]]:
    return (
        [_offset_east(east) for east, _ in stations],
        [_offset_north(north) for _, north in stations],
    )


def _edge_geometry_columns(
    edges: list[list[tuple[float, float]]],
) -> _EdgeGeometryColumns:
    columns = _EdgeGeometryColumns([], [], [], [])
    for edge in edges:
        columns.point_start.append(len(columns.point_east))
        columns.point_len.append(len(edge))
        for east, north in edge:
            columns.point_east.append(_offset_east(east))
            columns.point_north.append(_offset_north(north))
    return columns


def _trip_columns(trips: list[Trip]) -> _TripColumns:
    columns = _TripColumns([], [], [], [], [], [], [], [], [], [], [], [])
    for trip in trips:
        columns.category.append(trip.category)
        columns.first_departure.append(trip.events[0].departure)
        columns.last_arrival.append(trip.events[-1].arrival)
        columns.event_start.append(len(columns.event_station))
        columns.event_len.append(len(trip.events))
        columns.path_start.append(len(columns.path))
        for event in trip.events:
            columns.event_station.append(event.station)
            columns.event_arrival.append(event.arrival)
            columns.event_departure.append(event.departure)
            columns.event_leg_edge_count.append(len(event.leg_edges))
            columns.path.extend(event.leg_edges)
        columns.path_len.append(len(columns.path) - columns.path_start[-1])
    return columns


def _sections(
    station_east: list[int],
    station_north: list[int],
    geometry: _EdgeGeometryColumns,
    trips: _TripColumns,
) -> list[bytes]:
    return [
        _pad_to_four(_column("I", station_east) + _column("I", station_north)),
        _pad_to_four(
            _column("I", geometry.point_start) + _column("H", geometry.point_len)
        ),
        _pad_to_four(
            _column("I", geometry.point_east) + _column("I", geometry.point_north)
        ),
        _pad_to_four(
            _column("B", trips.category)
            + _column("I", trips.first_departure)
            + _column("I", trips.last_arrival)
            + _column("I", trips.event_start)
            + _column("H", trips.event_len)
            + _column("I", trips.path_start)
            + _column("I", trips.path_len)
        ),
        _pad_to_four(
            _column("I", trips.event_station)
            + _column("I", trips.event_arrival)
            + _column("I", trips.event_departure)
            + _column("H", trips.event_leg_edge_count)
        ),
        _pad_to_four(_column("i", trips.path)),
    ]


def _section_offsets(sections: list[bytes]) -> list[int]:
    offsets = []
    running = HEADER_SIZE
    for section in sections:
        offsets.append(running)
        running += len(section)
    return offsets


def create_schedule_blob(day: ScheduleDay, network_type: NetworkType) -> bytes:
    station_east, station_north = _station_columns(day.stations)
    geometry = _edge_geometry_columns(day.edges)
    trips = _trip_columns(day.trips)
    sections = _sections(station_east, station_north, geometry, trips)

    header = struct.pack(
        _HEADER_FORMAT,
        MAGIC,
        VERSION,
        network_type,
        int(day.service_date.strftime("%Y%m%d")),
        LV95_ORIGIN_EAST,
        LV95_ORIGIN_NORTH,
        COORD_SCALE,
        0,
        len(day.stations),
        len(day.edges),
        len(geometry.point_east),
        len(day.trips),
        len(trips.event_station),
        len(trips.path),
        *_section_offsets(sections),
        0,
        0,
        0,
        0,
    )
    return header + b"".join(sections)


def read_header(data: bytes) -> ScheduleHeader:
    fields = struct.unpack(_HEADER_FORMAT, data[:HEADER_SIZE])
    magic = fields[0]
    if magic != MAGIC:
        raise ValueError(f"not an ITSB blob: {magic!r}")
    return ScheduleHeader(
        version=fields[1],
        network_type=fields[2],
        service_date=fields[3],
        coord_origin_east=fields[4],
        coord_origin_north=fields[5],
        coord_scale=fields[6],
        station_count=fields[8],
        edge_count=fields[9],
        point_count=fields[10],
        trip_count=fields[11],
        event_count=fields[12],
        path_count=fields[13],
        offset_stations=fields[14],
        offset_edges=fields[15],
        offset_points=fields[16],
        offset_trips=fields[17],
        offset_events=fields[18],
        offset_path=fields[19],
    )


def _read_column(data: bytes, typecode: str, count: int, start: int) -> list[int]:
    column = array.array(typecode)
    item_size = column.itemsize
    column.frombytes(data[start : start + count * item_size])
    if sys.byteorder == "big":
        column.byteswap()
    return column.tolist()


def datetime_date_from_yyyymmdd(value: int) -> date:
    return date(value // 10000, (value // 100) % 100, value % 100)


def read_schedule_blob(data: bytes) -> ScheduleDay:
    header = read_header(data)
    east_origin = header.coord_origin_east
    north_origin = header.coord_origin_north

    start = header.offset_stations
    station_east = _read_column(data, "I", header.station_count, start)
    station_north = _read_column(
        data, "I", header.station_count, start + header.station_count * 4
    )
    stations = [
        (float(east + east_origin), float(north + north_origin))
        for east, north in zip(station_east, station_north, strict=True)
    ]

    start = header.offset_edges
    edge_point_start = _read_column(data, "I", header.edge_count, start)
    edge_point_len = _read_column(
        data, "H", header.edge_count, start + header.edge_count * 4
    )

    start = header.offset_points
    point_east = _read_column(data, "I", header.point_count, start)
    point_north = _read_column(
        data, "I", header.point_count, start + header.point_count * 4
    )
    edges = [
        [
            (
                float(point_east[index] + east_origin),
                float(point_north[index] + north_origin),
            )
            for index in range(first, first + length)
        ]
        for first, length in zip(edge_point_start, edge_point_len, strict=True)
    ]

    start = header.offset_trips
    count = header.trip_count
    trip_category = _read_column(data, "B", count, start)
    start += count  # category uint8
    start += count * 4  # skip trip_first_departure (engine fast-path, derivable)
    start += count * 4  # skip trip_last_arrival
    trip_event_start = _read_column(data, "I", count, start)
    start += count * 4
    trip_event_len = _read_column(data, "H", count, start)

    start = header.offset_events
    events_count = header.event_count
    event_station = _read_column(data, "I", events_count, start)
    start += events_count * 4
    event_arrival = _read_column(data, "I", events_count, start)
    start += events_count * 4
    event_departure = _read_column(data, "I", events_count, start)
    start += events_count * 4
    event_leg_edge_count = _read_column(data, "H", events_count, start)

    path = _read_column(data, "i", header.path_count, header.offset_path)

    trips = []
    path_cursor = 0
    for trip_index in range(count):
        event_start = trip_event_start[trip_index]
        events = []
        for event_index in range(event_start, event_start + trip_event_len[trip_index]):
            leg_count = event_leg_edge_count[event_index]
            leg_edges = path[path_cursor : path_cursor + leg_count]
            path_cursor += leg_count
            events.append(
                Event(
                    station=event_station[event_index],
                    arrival=event_arrival[event_index],
                    departure=event_departure[event_index],
                    leg_edges=leg_edges,
                )
            )
        trips.append(Trip(category=trip_category[trip_index], events=events))

    service_date = datetime_date_from_yyyymmdd(header.service_date)
    return ScheduleDay(
        service_date=service_date, stations=stations, edges=edges, trips=trips
    )
