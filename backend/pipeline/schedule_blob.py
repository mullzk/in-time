import array
import struct
import sys
from dataclasses import dataclass
from datetime import date

# Binary schedule blob v1 (ITSB). Columnar, little-endian; the rail network
# geometry is stored once as a shared, deduplicated edge list, and every trip is
# a reference: a path of signed 1-based edge indices plus per-stop schedule
# times.

MAGIC = b"ITSB"
VERSION = 1
FLAG_RAIL_ONLY = 1
COORD_SCALE = 1
LV95_ORIGIN_EAST = 2_480_000
LV95_ORIGIN_NORTH = 1_070_000

_HEADER_FORMAT = "<4sHHIIIHHIIIIIIIIIIII4I"
HEADER_SIZE = struct.calcsize(_HEADER_FORMAT)


@dataclass
class Event:
    station: int
    arr: int
    dep: int
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
    flags: int
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


def write_schedule_blob(day: ScheduleDay) -> bytes:
    station_east = [_offset_east(east) for east, _ in day.stations]
    station_north = [_offset_north(north) for _, north in day.stations]

    edge_point_start: list[int] = []
    edge_point_len: list[int] = []
    point_east: list[int] = []
    point_north: list[int] = []
    for edge in day.edges:
        edge_point_start.append(len(point_east))
        edge_point_len.append(len(edge))
        for east, north in edge:
            point_east.append(_offset_east(east))
            point_north.append(_offset_north(north))

    trip_category: list[int] = []
    trip_first_dep: list[int] = []
    trip_last_arr: list[int] = []
    trip_event_start: list[int] = []
    trip_event_len: list[int] = []
    trip_path_start: list[int] = []
    trip_path_len: list[int] = []
    ev_station: list[int] = []
    ev_arr: list[int] = []
    ev_dep: list[int] = []
    ev_leg_edge_count: list[int] = []
    path: list[int] = []
    for trip in day.trips:
        trip_category.append(trip.category)
        trip_first_dep.append(trip.events[0].dep)
        trip_last_arr.append(trip.events[-1].arr)
        trip_event_start.append(len(ev_station))
        trip_event_len.append(len(trip.events))
        trip_path_start.append(len(path))
        for event in trip.events:
            ev_station.append(event.station)
            ev_arr.append(event.arr)
            ev_dep.append(event.dep)
            ev_leg_edge_count.append(len(event.leg_edges))
            path.extend(event.leg_edges)
        trip_path_len.append(len(path) - trip_path_start[-1])

    sections = [
        _pad_to_four(_column("I", station_east) + _column("I", station_north)),
        _pad_to_four(_column("I", edge_point_start) + _column("H", edge_point_len)),
        _pad_to_four(_column("I", point_east) + _column("I", point_north)),
        _pad_to_four(
            _column("B", trip_category)
            + _column("I", trip_first_dep)
            + _column("I", trip_last_arr)
            + _column("I", trip_event_start)
            + _column("H", trip_event_len)
            + _column("I", trip_path_start)
            + _column("I", trip_path_len)
        ),
        _pad_to_four(
            _column("I", ev_station)
            + _column("I", ev_arr)
            + _column("I", ev_dep)
            + _column("H", ev_leg_edge_count)
        ),
        _pad_to_four(_column("i", path)),
    ]

    offsets = []
    running = HEADER_SIZE
    for section in sections:
        offsets.append(running)
        running += len(section)

    header = struct.pack(
        _HEADER_FORMAT,
        MAGIC,
        VERSION,
        FLAG_RAIL_ONLY,
        int(day.service_date.strftime("%Y%m%d")),
        LV95_ORIGIN_EAST,
        LV95_ORIGIN_NORTH,
        COORD_SCALE,
        0,
        len(day.stations),
        len(day.edges),
        len(point_east),
        len(day.trips),
        len(ev_station),
        len(path),
        *offsets,
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
        flags=fields[2],
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
    start += count * 4  # skip trip_first_dep (engine fast-path, derivable)
    start += count * 4  # skip trip_last_arr
    trip_event_start = _read_column(data, "I", count, start)
    start += count * 4
    trip_event_len = _read_column(data, "H", count, start)

    start = header.offset_events
    events_count = header.event_count
    ev_station = _read_column(data, "I", events_count, start)
    start += events_count * 4
    ev_arr = _read_column(data, "I", events_count, start)
    start += events_count * 4
    ev_dep = _read_column(data, "I", events_count, start)
    start += events_count * 4
    ev_leg_edge_count = _read_column(data, "H", events_count, start)

    path = _read_column(data, "i", header.path_count, header.offset_path)

    trips = []
    path_cursor = 0
    for trip_index in range(count):
        event_start = trip_event_start[trip_index]
        events = []
        for event_index in range(event_start, event_start + trip_event_len[trip_index]):
            leg_count = ev_leg_edge_count[event_index]
            leg_edges = path[path_cursor : path_cursor + leg_count]
            path_cursor += leg_count
            events.append(
                Event(
                    station=ev_station[event_index],
                    arr=ev_arr[event_index],
                    dep=ev_dep[event_index],
                    leg_edges=leg_edges,
                )
            )
        trips.append(Trip(category=trip_category[trip_index], events=events))

    service_date = datetime_date_from_yyyymmdd(header.service_date)
    return ScheduleDay(
        service_date=service_date, stations=stations, edges=edges, trips=trips
    )


def datetime_date_from_yyyymmdd(value: int) -> date:
    return date(value // 10000, (value // 100) % 100, value % 100)
