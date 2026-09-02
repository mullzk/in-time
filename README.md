# All in Time

Mapping public transport data: a web app that visualises and sonifies the rhythm
of the Swiss clock-face timetable (Taktfahrplan). See https://all-in-time.ch

## Views

Three views on the same day, one page each, switched by a page load:

- **`/taktfahrplan`** — the day's timetable as pulsing motion; sonified.
- **`/reisefaecher`** — reachability spreading from a station over time.
- **`/zeitkarte`** — a radial still image of travel times from a station.

Each takes an optional station in the path (`/taktfahrplan/zürich-hb`).
`?mode=exhibition` is the unattended kiosk variant: no view switcher, no
instrumentation editor, and a view awaiting a station picks one itself instead
of asking.

## Data

GTFS planned timetable (opentransportdata.swiss) and swisstopo maps,
Switzerland-wide, always the current day. Rail and tram are routed over the BAV
rail network geometry, buses run straight-line between stops.

## Getting started

Requirement: [mise](https://mise.jdx.dev/), activated in your shell.

```bash
mise trust && mise install
uv sync
cp .env.example .env    # adjust if local dev environment defaults do not fit.
python backend/manage.py migrate
python backend/manage.py build_schedule
python backend/manage.py runserver
```

Without shell activation, drop the `mise` and `uv` commands and prefix the three
`python`-commands with `mise exec -- uv run `.

### Without mise

Install `python` as stated in `mise.toml` (`node` as well, for frontend tooling)
and the dependencies listed in `pyproject.toml`. From there the `manage.py`
sequence above is the same.

### What `build_schedule` and `runserver` do

`build_schedule` fetches the sources, assembles the current service day and
publishes it. Without it nothing is published and `/api/config` returns `503`.

`runserver` starts a local django-server so you can access the app in your
browser on http://127.0.0.1:8000/. Under `DEBUG` the dev server stands in for
the reverse proxy: it serves `/artifacts/` from the data directory and proxies
`/tiles/` to swisstopo. (`DJANGO_DEBUG` in `.env`)

### Developer tooling

We run `ruff` and `mypy` on our python code, `biome` and `prettier` on
everything else. The backend is tested with `pytest`, the frontend with plain
`npm test`. All tools are present in CI, some also in githook.

All tools are combined in two commands:

- `tooling/check.sh` — every formatter and linter (`--fix` applies).
- `tooling/test.sh` — both test suites.

The additional django-command `verify_railnet --gdb <path>` loads a BAV network
geodatabase on its own and reports node, edge and subnetwork counts plus
timings. Publishes nothing; for judging a new network release.

## Architecture

### Pipeline

A daily Django command (`build_schedule`) turns two versioned archives — the
GTFS feed and the BAV rail network — into the artifacts the client reads. Both
versions together tag the run, so a day already published from the same pair is
skipped rather than rebuilt.

- Inputs become a rail graph in LV95, one point per Swiss station, the
  interchange clusters that make a railway station and its surrounding tram and
  bus stops one place, and a feed-wide scan of which connections run regularly
  enough to belong on a base map.
- The day splits into two published networks, railbound (rail and tram) and road
  (bus). Railbound legs are routed over the track network, with the shared
  geometry held once and referenced; bus legs carry no geometry at all.
- The output per network is a binary schedule blob plus a station catalog, each
  written with `.gz` and `.br` sidecars. Publishing swaps a symlink to the new
  day and drops the day it replaced.
- `BuildRun` is the permanent ledger of every attempt — day, source version,
  outcome — and is what skip-if-done reads.

### HTTP surface

Everything else the client needs comes from the reverse proxy.

- `/taktfahrplan`, `/reisefaecher`, `/zeitkarte`: simple html-pages loading js
  and css and providing the canvas.
- `/api/config`: returns a dict with the serviceDate and the urls to the
  scheduleBlobs and stationCatalogs; `503` when nothing is published.
- `/api/stations-rail`, `/api/stations-road`: station catalog per network
  (`[{ didok, name, modes, cluster }]`, in blob index order).
- `/health/` — plain `ok`.

Every `/api/*` response carries a weak `ETag` over its own payload plus
`Cache-Control: public, no-cache`. The ETag is keyed to the payload, not the
service day: a deploy can change config URLs and a rebuild can re-emit the same
day with new fields.

Blob URLs point at `/artifacts/schedule-rail.itsb` and `schedule-road.itsb` with
the published file's version as `?v=…`, so a rebuild is a new address.

### Frontend

Static ES modules under `frontend/`. No bundler, no CDN! Runtime dependencies
are vendored with `npm run vendor` and tracked in git. In order to allow
dependency-management (dependabot), CI checks consistency with
`npm run vendor:check`

- `VizCore` owns the single [p5.js](https://p5js.org/) instance and render loop;
  the panels plug into it.
- A panel is a view's plug-in: It implements the lifecycle hooks — `update`,
  `drawWorld` inside the camera transform, `drawOverlay` in screen space. The
  panels sees camera, time and background-tiles in its context. Every panel also
  declares its UI-controls.
- Core-Elements: _`Camera`_ (LV95 world space, zoom/pan clamps), _`TimeModel`_
  (operating window, tempo, loop, scrubber), _`StationCatalog`_ (both networks
  merged, search ranking).
- _What the views draw is computed in the browser_, from the schedule blobs
  alone — the server only serves static content and does not care what the
  browser shows:
  - `VehiclePositionEngine` reads a blob and answers `activeAt(t)`: every trip
    running at that moment with its position interpolated along the route
    geometry. That is the pulse the taktfahrplan view animates.
  - `ConnectionList` (every leg of the day in departure order, one shared
    station directory) plus `ConnectionScan` (one pass, earliest arrival per
    station) yield the reachability tree the reisefaecher and zeitkarte views
    draw — ~2.3 million legs in milliseconds.
- The background is a swisstopo tile layer under the drawing: `TileLayer`
  fetches and caches what the camera sees on the LV95 tile grid
  (`tileMatrixSet`).
- Sonification runs off the same blobs: `SonificationEngine` indexes a blob's
  events per station, `Sonifier` voices the selected station (an interchange
  counting as one place) through vendored
  [superdough](https://www.npmjs.com/package/superdough); samples vendored too.
  What plays is described by an instrumentation, a JSON document the
  `InstrumentationEditor` drawer edits live and keeps in local storage.
- The UI-Controls (dock, station-search, clock) live outside the canvas. Each
  panel decides which controls are present.
- Styling is [SMACSS](http://smacss.com/) as static CSS under
  `frontend/styles/`.
- Golden fixtures under `frontend/viz-core/fixtures/` (written by
  `python -m pipeline.tests.golden_blob`) pin the blob format across the two
  languages.

## Deployment requirements

What the serving environment has to provide; implemented in another project
(`webapp_infra`).

- gunicorn: Python application server — running `./backend/`
- nginx: Reverse proxy,
  - making the python application server accessible to the outside.
  - serving static files (frontend-js) and artifacts directly.
  - providing a cached tile proxy to swisstopo. The client requests same-origin
    `/tiles/{layer}/{z}/{x}/{y}.{ext}`; the proxy adds host, referer and cache.
- mariadb: Database — the `BuildRun` ledger.
- A scheduler running `build_schedule` daily, alerting on failure. It builds the
  current day (Europe/Zurich), so it must run after local midnight.
- An environment with configuration and secrets not in the repo.
- A persistent data directory, shared by app and build commands, surviving
  deploys.

The app tries to be product-agnostic, so switching out gunicorn, nginx, mariadb
and systemd should be easily possible.

## Further reading

- [`GLOSSARY.md`](GLOSSARY.md) — abbreviations and domain terms used across the
  code and docs.
