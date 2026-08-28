# Glossary

Abbreviations and domain terms used across the code and docs.

## Abbreviations

- **GTFS** — General Transit Feed Specification, the open format of the planned
  timetable, published for Switzerland on opentransportdata.swiss.
- **DiDok** — Dienststellendokumentation. The Swiss stop/station register
  number; our stable station key.
- **BPUIC** — Betriebspunkt UIC, the stop identifier GTFS carries for a Swiss
  stop; it is the DiDok number.
- **SLOID** — Swiss Location ID. GTFS identifier per stop and platform; resolves
  to a DiDok, never a key of ours.
- **BAV** — Bundesamt für Verkehr, the Swiss Federal Office of Transport;
  publishes the rail network geodata.
- **GDB** — Esri File Geodatabase, the format the BAV network arrives in.
- **LV95** — Landesvermessung 1995, the Swiss national coordinate reference
  (east/north in metres); world space of the whole app.
- **WGS84** — World Geodetic System 1984 (lat/long). Used in GTFS.
- **EPSG** — registry naming coordinate reference systems by number: EPSG:2056
  is LV95, EPSG:4326 is WGS84.
- **ITRC** — "In Time Regular Connections", frequency-filter cache sidecar.
- **ITSB** — "In Time Schedule Blob", binary daily timetable artifacts.
- **LRU** — least recently used, the eviction order of the decoded map tiles.
- **WMTS** — Web Map Tile Service, the standard the swisstopo tile server
  speaks; only our proxy talks to it.
- **NFD** — the Unicode normalisation form splitting accented letters into base
  plus mark; how search and URL slugs fold diacritics.
- **FM** — frequency modulation, the synthesis of the bell sound.
- **SMACSS** — Scalable and Modular Architecture for CSS, the layering of the
  static stylesheets (base, layout, module, state).

## Timetable domain

- **Service day / service date** — the operating day; runs past midnight (to ≈
  33 h).
- **Trip** — one run of one vehicle across the day.
- **Leg** — the stretch between two consecutive stops of a trip.
- **Stop call** — one stop of a trip: arrival and departure at a DiDok.
- **Connection** — a station pair plus mode, the unit the frequency filter
  judges.
- **Product category** — Fernverkehr, InterRegio, Regio, S-Bahn, other rail,
  tram, bus.
- **Route type** — the GTFS numeric code a category is derived from.
- **Interchange / cluster** — several DiDoks at one physical place, treated as
  one.
- **Place** — a dot in a picture: an interchange, not a single stop.
- **Frequency filter / regular connection** — what runs often enough to enter
  the base map.
- **Foreign stop bridging** — foreign stops skipped, their Swiss neighbours
  joined.
- **Operating window / opening time** — the day's service window, and the moment
  a view opens on.

## Travel time & spread

- **Connection scan** — one pass over all legs of the day.
- **Connection list** — every leg in departure order, the scan's input.
- **Station directory** — one shared station index over both networks.
- **Reachability tree** — the earliest arrivals, ground of both views.
- **Earliest arrival** — the earliest time one can be at a station.
- **Spread / wildfire** — reachability widening over time.
- **Radial travel time** — the radial still image of travel times.
- **Settled layer / unreached** — places already reached; places never reached.

## Artifacts & pipeline

- **Blob — columnar, little-endian, magic, header** — the shape of a daily
  artifact.
- **Golden fixture** — a pinned format sample coupling writer and reader.
- **Sidecar** — the `.gz`/`.br` next to an artifact; also the frequency cache
  file.
- **Pre-compression (gzip/brotli static)** — serving what was compressed at
  build time.
- **Artifact directory / `current` symlink / atomic swap** — how a day is
  published.
- **Build run** — one run of the daily build, with its record.
- **Versioned artifact URL (`?v=…`)** — cache busting by published file version.
- **Union-find** — the method behind cluster building.
- **Counting sort** — the sort behind the connection list.
