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

## Frequency filter — `frequency.scan_regular_edges`

Source: GTFS feed 2026 (full year, ~15 M `stop_times` rows), feed 2026-07-15.
Yearly scan, cached per GTFS version. An edge is regular at `≥300` operating
days **and** `≥4` departures per day; a trip drops as soon as one edge is
irregular. Local run, Apple Silicon.

| metric                            | value                    |
| --------------------------------- | ------------------------ |
| trips classified (rail/tram/bus)  | 1 641 400                |
| services with a calendar          | 62 674                   |
| prep (routes + trips + calendar)  | 26 s                     |
| stop_times scan                   | 30 s                     |
| raw edges (rail / tram / bus)     | 33 230 (2616/681/29 933) |
| regular edges (rail / tram / bus) | 24 867 (2000/594/22 273) |
| max service bitmask               | 711 bits                 |

## Day build — `build_day_builds` + `write_day_artifacts`

Two blobs per day: `schedule.itsb` (rail + tram routed over the BAV network) and
`schedule-road.itsb` (buses drawn as straight lines between stops, no geometry).
GTFS feed 2026 + rail network GDB, day 2026-07-16. Local run, Apple Silicon.

| metric                                | BAV (rail+tram)     | road (bus)      |
| ------------------------------------- | ------------------- | --------------- |
| trips                                 | 26 628              | 105 330         |
| stations                              | 2 013               | 18 931          |
| blob raw / gz                         | 8.15 / 1.16 MB      | 27.28 / 3.79 MB |
| routing direct/multi/recover/straight | 99.22/0.74/0/0.04 % | — (straight)    |

Frequency edges are cached per GTFS version (sidecar `regular_edges.bin`, 0.30
MB): first build scans ~56 s, later builds load in ~6 ms.

## Source fetches — `fetch.py` (network-bound, indicative)

Version resolution is cheap (no payload): GTFS from the redirect filename, BAV
from the `Last-Modified` header. A second `ensure()` skips the download.

| source                        | download | extracted | fetch + extract |
| ----------------------------- | -------- | --------- | --------------- |
| BAV rail network (`.gdb.zip`) | 3.4 MB   | 7.5 MB    | ~0.7 s          |
| GTFS feed (permalink `.zip`)  | ~100 MB  | ~2 GB     | not benchmarked |
