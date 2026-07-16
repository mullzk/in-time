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
