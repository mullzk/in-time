# Pipeline performance

Order-of-magnitude reference for each pipeline feature on real data. Update on
creation and on significant changes: input size, processing time, output size.

## Rail network graph — `railnet_gdb.load_rail_graph` + `RailRouter`

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
