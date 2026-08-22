# Pipeline performance

Order-of-magnitude reference for each pipeline feature on real data. Update on
creation and on significant changes: input size, processing time, output size.

## Rail network graph — `rail_gdb.load_rail_graph` + `RailRouter`

Source: `schienennetz_2056_de.gdb` (BAV Schienennetz, feed 2026). Local run,
Apple Silicon.

| metric                             | value   |
| ---------------------------------- | ------- |
| input GDB size                     | 7.5 MB  |
| rail graph nodes                   | 3210    |
| rail graph edges                   | 3377    |
| DiDok stations                     | 3210    |
| shared edges (simplified 30 m)     | 3516    |
| shared edge points                 | 15972   |
| components (raw → bridged 150 m)   | 52 → 11 |
| load time (read GDB → graph)       | 0.4 s   |
| build time (shared edges + bridge) | 0.2 s   |

## Bus-stop catalog — `bus_stops.load_bus_stops`

Source: GTFS feed 2026 (`stops.txt`, 103 039 rows), day 2026-07-15. One LV95
station point per Swiss BPUIC; platforms collapsed, foreign stops dropped. Local
run, Apple Silicon.

| metric                           | value             |
| -------------------------------- | ----------------- |
| `stops.txt` rows                 | 103 039           |
| Swiss BPUIC (kept)               | 26 047            |
| foreign rows dropped (non-`85…`) | 20 590            |
| load + reproject (WGS84 → LV95)  | 0.22 s            |
| Zürich HB 8503000 (LV95)         | 2683190 / 1248066 |

## Station clusters — `station_clusters.load_station_clusters`

Source: GTFS feed (`stops.txt` + `transfers.txt`), version 20260722. Union-find
over the Swiss transfer edges in BPUIC space, for the sonification's "one
interchange = one ear" grouping. Local run, Apple Silicon.

| metric                               | value                        |
| ------------------------------------ | ---------------------------- |
| clustered didoks                     | 5 195                        |
| clusters (≥ 2 members)               | 2 081                        |
| load (`stops.txt` + `transfers.txt`) | ~1.5 s                       |
| Bern cluster (rep 8507000)           | 7 members, rail + tram + bus |

## Frequency filter — `frequency.scan_regular_connections`

Source: GTFS feed 2026 (full year, ~15 M `stop_times` rows), feed 2026-07-15.
Yearly scan, cached per GTFS version. A connection is regular at `≥300`
operating days **and** `≥4` departures per day. Local run, Apple Silicon.

| metric                           | value                    |
| -------------------------------- | ------------------------ |
| trips classified (rail/tram/bus) | 1 641 400                |
| services with a calendar         | 62 674                   |
| prep (routes + trips + calendar) | 26 s                     |
| stop_times scan                  | 30 s                     |
| raw connections (rail/tram/bus)  | 33 230 (2616/681/29 933) |
| regular connections (r/t/b)      | 24 867 (2000/594/22 273) |
| max service bitmask              | 711 bits                 |

## Day build — `build_schedule_day` + `write_day_artifacts`

Two blobs per day: `schedule-rail.itsb` (rail + tram routed over the BAV
network) and `schedule-road.itsb` (buses drawn as straight lines between stops,
no geometry). GTFS feed 2026-08-19 + rail network GDB, day 2026-08-22 (a
Saturday, hence fewer trips than the weekday run this table held before). Local
run, Apple Silicon.

| metric                                | rail (rail+tram+metro) | road (bus)      |
| ------------------------------------- | ---------------------- | --------------- |
| trips                                 | 25 330                 | 102 225         |
| stations                              | 2 093                  | 20 686          |
| blob raw / gz                         | 7.77 / 1.03 MB         | 25.57 / 3.45 MB |
| inputs load / day build               | 70.3 s / 45.5 s        | (same run)      |
| routing direct/multi/recover/straight | 99.20/0.76/0/0.04 %    | — (straight)    |

The two straight-line fallbacks left are Croix-du-Nant <-> Monthey-Hôpital (1.7
km each way).

Blob v2 dropped the four per-trip columns no reader consumed (first departure,
last arrival, and the path slice bounds), 16 bytes per trip: 0.43 MB off the
rail blob and 2.06 MB (6 %) off the road blob.

The frequency filter is asymmetric: a rail or tram trip drops on any irregular
connection, but a bus trip is kept as long as one connection is regular (so a
frequent urban line whose city-centre routing varies day to day survives). That
lenience adds the ~23 700 bus trips (+22 %) an all-connections-regular rule
would have dropped whole.

Regular connections are cached per GTFS version (sidecar
`regular_connections.bin`, 0.30 MB): first build scans ~56 s, later builds load
in ~6 ms.

## Source fetches — `fetch.py` (network-bound, indicative)

Version resolution is cheap (no payload): GTFS from the redirect filename, BAV
from the `Last-Modified` header. A second `ensure()` skips the download.

| source                        | download | extracted | fetch + extract |
| ----------------------------- | -------- | --------- | --------------- |
| BAV rail network (`.gdb.zip`) | 3.4 MB   | 7.5 MB    | ~0.7 s          |
| GTFS feed (permalink `.zip`)  | ~100 MB  | ~2 GB     | not benchmarked |
