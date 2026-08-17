# All in Time

Mapping Public Transportation Data

_All in Time_ visualises — and makes audible — the rhythm of the Swiss
clock-face timetable (Taktfahrplan): the heartbeat of the country's base
infrastructure. The name carries the double sense of _in time_ (musical, in
tempo) and _on time_ (Swiss punctuality).

## Product vision & scope

A web app as a **gallery of five views** onto the same public-transport data,
each a distinct perspective:

1. **Spread** — how reachability spreads out from a location over time
   (wildfire).
2. **Travel-time graph** — a radial still image of travel times from a location.
3. **Takt** — the day's timetable as a pulsing motion; also **sonified**.
4. **Delays** — the delays actually measured on a past day.
5. **Hotspots** — aggregated delay hotspots over a freely chosen time range.

**Two usage contexts:** the regular web app and an **exhibition mode** (kiosk,
unattended). Data sources: the GTFS planned timetable, actual (measured) data,
and swisstopo geometry — Switzerland-wide, always the **current day**. Rail and
tram run on the real geometry of the BAV rail network; buses are drawn as
straight lines between their stops, since routing them over the road network
would buy little at the zoom levels the views live at.

## Running locally

Prerequisites: [mise](https://mise.jdx.dev/) (pins Python) and
[uv](https://docs.astral.sh/uv/) (dependencies).

```bash
cp .env.example .env          # then fill in the values
mise exec -- uv run python backend/manage.py migrate
mise exec -- uv run python backend/manage.py build_schedule
mise exec -- uv run python backend/manage.py runserver
```

Then browse <http://127.0.0.1:8000/>. `build_schedule` publishes the current
day's artifacts; without it, `/api/config` returns `503` (nothing published
yet). Run the commands from the repository root so the relative
`IN_TIME_DATA_DIR` resolves. In `DEBUG` the dev server also serves `/artifacts/`
from the data directory and proxies `/tiles/` to swisstopo, so both the schedule
blobs and the map tiles load without the reverse proxy.

`tooling/check.sh` runs every formatter and linter (`--fix` applies them),
`tooling/test.sh` runs both test suites.

A second management command, `verify_railnet --gdb <path>`, loads a BAV rail
network geodatabase on its own and reports node, edge and subnetwork counts plus
load and routing-build times. It publishes nothing and is meant for judging a
new network release before a build runs on it.

## HTTP surface

The browser-facing app (`web`) exposes a small surface; everything else the
client needs is served directly by the reverse proxy.

- `GET /` — the entry point, redirecting to the current default view. Each panel
  has its own page below it, reached through the redirect or the in-app view
  chooser; those paths are not listed here because their names are still
  settling.
- `GET /api/config` — JSON
  `{ serviceDate, railScheduleBlobUrl, roadScheduleBlobUrl, railStationsUrl, roadStationsUrl }`.
  The service day is read from the `current` artifact symlink. Returns `503`
  when no day is published yet.
- `GET /api/stations-rail`, `GET /api/stations-road` — the station catalog per
  network (`[{ didok, name, modes, cluster }]`, in blob index order; `cluster`
  only for a stop belonging to an interchange), passed through from the
  published artifacts.

Every `/api/*` endpoint carries a weak `ETag` over its own payload plus
`Cache-Control: public, no-cache`, so a client revalidates cheaply (`304`) until
the content actually changes. The ETag is deliberately not keyed to the service
day: a deploy can change the config URLs and a rebuild can re-emit the same day
with new fields, and a day-keyed validator would strand clients on a stale body.

The schedule blobs themselves are **not** served by the app in production: the
proxy serves them from the published `current` symlink under the stable URLs
`/artifacts/schedule-rail.itsb` and `/artifacts/schedule-road.itsb` (the dev
server stands in for the proxy under `DEBUG`).

## Frontend (viz-core)

The client lives in `frontend/` as static ES modules with **no bundler**; the
runtime stays bundler-free. `viz-core` is a small framework and the Takt panel
plugs into it:

- **`VizCore`** owns the single [p5.js](https://p5js.org/) instance-mode render
  loop (vendored as `frontend/vendor/p5.esm.min.js`, pinned in `package.json`
  and kept in sync by `npm run vendor` / checked in CI by
  `npm run vendor:check`).
- The pure, unit-tested core — **`Camera`** (LV95 world space, screen↔world,
  zoom/pan clamps), **`Projection`** (WGS84→LV95), **`TimeModel`** (operating
  window, tempo, loop, scrubber), **`VehiclePositionEngine`** (reads a binary
  schedule blob and answers `activeAt(t)` with interpolated positions) and
  **`StationCatalog`** (the merged stations of both networks, with the search
  ranking) — carries no p5 or DOM, so `node:test` covers it directly. Rendering
  is verified visually.
- The **`VehiclePositionEngine`** mirrors the Python blob writer column for
  column; the committed golden fixtures under `frontend/viz-core/fixtures/`
  (generated by `python -m pipeline.tests.golden_blob`) are the cross-language
  proof that reader and writer agree on the format.
- **Sonification** is a sibling of the position engine and runs entirely in the
  browser off the same daily blobs: a `SonificationEngine` indexes a blob's
  events by station, and the `Sonifier` voices the selected station — a whole
  interchange counting as one place — through the vendored
  [superdough](https://www.npmjs.com/package/superdough) audio engine. Its
  samples are vendored too, so the client fetches audio same-origin like
  everything else.
- **An instrumentation is a document, not code.** A JSON file under
  `frontend/viz-core/sonification/instrumentations/` names a sound per transport
  group and per event (arrival, departure, pass-through, standing); what it
  leaves out is inherited from the level above it, down to the sound itself and
  the kind of sound it is. The sounds it may name are the registry in
  `sonification/sounds/`, and that same registry is what the vendoring script
  mirrors — so a sound the app offers is one it can play.
- **A listener may write one.** The `InstrumentationEditor` is a drawer opposite
  the sidebar in which such a document is typed and checked on every keystroke;
  what plays is heard at once and kept in the browser's local storage, so it
  outlasts the page and joins the dropdown. It never reaches the server, and the
  exhibition mode does not build it.
- **Styling** follows [SMACSS](http://smacss.com/) as static CSS under
  `frontend/styles/` (base with design tokens, layout, one file per module) — no
  inline styles, bundler-free, biome-formatted. A base template carries the
  global layers; each page links only the modules it uses.

## Expectations toward the infrastructure

_All in Time_ expects of its runtime environment:

- **A Python application server** behind a **reverse proxy**. The proxy serves
  static files and large artifacts directly (not through the app server), so
  that slow clients never tie up app workers.
- **Static serving** of three paths by the proxy: the frontend assets
  (`STATIC_ROOT`), an **artifact directory** (daily binary blobs), and a **tile
  cache**.
- **Pre-compressed artifacts.** The schedule blobs are large (a current day: ≈ 8
  MB rail and tram, ≈ 32 MB bus) but, being columnar, compress by ~90 %. The
  build writes `.gz` and `.br` sidecars next to every artifact; the proxy is
  expected to serve them via its _static_ pre-compression (gzip/brotli), so
  nothing is recompressed per request. Sidecars sit in the per-day directory and
  swap atomically with the blob, so they never go stale.
- **A tile proxy with cache** (server-to-server to swisstopo) — the client talks
  **only** to our server, never to third-party hosts (for all assets, fonts,
  maps). The client requests same-origin `/tiles/{layer}/{z}/{x}/{y}.{ext}`; the
  proxy adds the swisstopo host, referer and cache, so the layer choice lives in
  the path and the client stays origin-agnostic.
- **A MariaDB database** (per app, with its own user).
- **A scheduler** running **two commands** daily (`build_schedule` for the
  planned timetable, `build_actuals` for the measured data) and alerting on
  failure. `build_schedule` builds the **current** day (Europe/Zurich), so it
  must run **after local midnight**; it briefly needs extra disk (a new raw feed
  is fetched next to the previous one before the old is pruned), so it should
  run **before the nightly VM snapshot** and not overlap it, keeping the
  snapshot consistent and free of the transient peak.
- **An env file** with the configuration/secret values (no hostname, no
  infrastructure reference in the code repo).
- **A persistent data directory** that survives deploys and is shared by the app
  _and_ the build commands.
- **Continuous deployment**: on green tests the new version is rolled out.

Implemented in another project (`webapp_infra`).

## Glossary

Domain abbreviations and special terms used across the code and docs.

- **GTFS** — General Transit Feed Specification: the open format of the planned
  timetable, published for Switzerland on opentransportdata.swiss.
- **DiDok** — the Swiss stop/station register number that uniquely identifies a
  station. In GTFS it appears as the **BPUIC**; we use it as the stable key for
  stations.
- **ITSB** — "In Time Schedule Blob": the 4-byte magic and name of the binary
  daily artifacts of the planned timetable (columnar, little-endian; the network
  geometry stored once as a shared edge list, each trip a reference into it). A
  day is published as one blob per network — rail (rail and tram, routed over
  the BAV network) and road (buses, straight lines, hence no edges) — with the
  network type in the header. Consumed by the Takt panel.
