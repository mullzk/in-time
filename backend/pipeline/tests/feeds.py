"""Shared GTFS feed-file emitters for the pipeline tests."""

STOPS_HEADER = (
    "stop_id,stop_name,stop_lat,stop_lon,location_type,parent_station,"
    "platform_code,original_stop_id,didok\n"
)


def stops_txt(*didoks: int) -> str:
    rows = "".join(
        f'"{didok}","S{didok}","47.0","8.0","1","","","","{didok}"\n'
        for didok in didoks
    )
    return STOPS_HEADER + rows


def trips_txt(*rows: tuple[str, str, str]) -> str:
    header = "route_id,service_id,trip_id\n"
    return header + "".join(
        f"{route},{service},{trip}\n" for route, service, trip in rows
    )


def stop_times(*trips: tuple[str, list[int]]) -> str:
    header = "trip_id,arrival_time,departure_time,stop_id,stop_sequence\n"
    rows = ""
    for trip_id, sequence in trips:
        for position, didok in enumerate(sequence):
            rows += f'"{trip_id}","08:00:00","08:00:00","{didok}","{position}"\n'
    return header + rows
