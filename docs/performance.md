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

## Road network graph — `road_gdb.load_road_graph` + `NetworkRouter`

Source: `SWISSTLM3D_CHLV95LN02.gdb`, layer `TLM_STRASSE` (swissTLM3D 2025-03).
Only classified roads are kept: `VERKEHRSBEDEUTUNG` ∈ {100 Hochleistungs-, 200
Durchgangs-, 300 Verbindungsstrasse}. Local run, Apple Silicon.

| metric                               | value           |
| ------------------------------------ | --------------- |
| download (`.gdb.zip`)                | 2.79 GB         |
| extracted GDB size                   | 5.2 GB          |
| `TLM_STRASSE` features (all)         | 2 077 573       |
| features after class filter          | 127 205         |
| road graph nodes                     | 123 654         |
| road graph edges                     | 127 205         |
| load time (read + filter → graph)    | 4.3 s           |
| shared edges (simplified 30 m)       | 147 525         |
| components (raw → bridged 50 m)      | → 5             |
| router build (shared edges + bridge) | 3.3 s           |
| sample leg (49.6 km straight)        | direct, 71.6 km |

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

## Schedule day build — `build_schedule_day`

Source: GTFS feed 2026 (2.1 GB `stop_times.txt`) + rail network GDB, day
2026-07-16. Local run, Apple Silicon.

| metric                                           | value                        |
| ------------------------------------------------ | ---------------------------- |
| input GTFS stop_times                            | 2.1 GB                       |
| trips (rail)                                     | 15518                        |
| stations touched                                 | 1616                         |
| shared edges (incl. 2 straight)                  | 3518                         |
| output blob (`schedule.itsb`)                    | 4.08 MB                      |
| routing direct / multi-snap / recover / straight | 99.06 / 0.90 / 0.00 / 0.05 % |
| graph load                                       | 0.4 s                        |
| day build (stream + route)                       | 27.4 s                       |
| blob round-trip                                  | ok                           |

## Source fetches — `fetch.py` (network-bound, indicative)

Version resolution is cheap (no payload): GTFS from the redirect filename, BAV
from the `Last-Modified` header. A second `ensure()` skips the download.

| source                        | download | extracted | fetch + extract |
| ----------------------------- | -------- | --------- | --------------- |
| BAV rail network (`.gdb.zip`) | 3.4 MB   | 7.5 MB    | ~0.7 s          |
| GTFS feed (permalink `.zip`)  | ~100 MB  | ~2 GB     | not benchmarked |
