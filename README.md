# In Time

Mapping Public Transportation Data

Working title. _In Time_ visualises — and makes audible — the rhythm of the
Swiss clock-face timetable (Taktfahrplan): the heartbeat of the country's base
infrastructure. The name carries the double sense of _in time_ (musical, in
tempo) and _on time_ (Swiss punctuality).

## Product vision & scope

A web app as a **gallery of five views** onto the same public-transport data,
each a distinct perspective:

1. **Spread** — how reachability spreads out from a location over time
   (wildfire).
2. **Travel-time graph** — a radial still image of travel times from a location.
3. **Heartbeat** — the day's timetable as a pulsing motion; also **sonified**.
4. **Delays** — the delays actually measured on a past day.
5. **Hotspots** — aggregated delay hotspots over a freely chosen time range.

**Two usage contexts:** the regular web app and an **exhibition mode** (kiosk,
unattended). Data sources: the GTFS planned timetable, actual (measured) data,
and swisstopo / swissTLM3D geometry — Switzerland-wide, always the **current
day**.

## Running locally

Prerequisites: [mise](https://mise.jdx.dev/) (pins Python) and
[uv](https://docs.astral.sh/uv/) (dependencies).

```bash
cp .env.example .env          # then fill in the values
mise exec -- uv run python backend/manage.py migrate
mise exec -- uv run python backend/manage.py build_schedule
mise exec -- uv run python backend/manage.py runserver
```

Then browse <http://127.0.0.1:8000>. `build_schedule` publishes the current
day's artifacts; without it, `/api/config` returns `503` (nothing published
yet). Run the commands from the repository root so the relative
`IN_TIME_DATA_DIR` resolves.

## HTTP surface

The browser-facing app (`web`) exposes a small surface; everything else the
client needs is served directly by the reverse proxy.

- `GET /api/config` — JSON `{ serviceDate, scheduleBlobUrl, stationsUrl }`. The
  service day is read from the `current` artifact symlink. Returns `503` when no
  day is published yet.
- `GET /api/stations` — the station catalog (`[{ didok, name }]`, in blob index
  order), passed through from the published artifact.
- `GET /herzschlag` — the Heartbeat page shell.

Both `/api/*` endpoints are keyed to the published day via a weak `ETag` and
`Cache-Control: public, no-cache`, so a client revalidates cheaply (`304`) until
the daily symlink swap changes the day — never caching a day across the swap.

The schedule blob itself is **not** served by the app: the proxy serves it from
the artifact directory under the stable URL `/artifacts/current/schedule.itsb`.

## Expectations toward the infrastructure

_In Time_ expects of its runtime environment:

- **A Python application server** behind a **reverse proxy**. The proxy serves
  static files and large artifacts directly (not through the app server), so
  that slow clients never tie up app workers.
- **Static serving** of three paths by the proxy: the frontend assets
  (`STATIC_ROOT`), an **artifact directory** (daily binary blobs), and a **tile
  cache**.
- **Pre-compressed artifacts.** The schedule blob is large (rail-only ≈ 4 MB,
  growing with tram/bus) but, being columnar, compresses by ~90 %. The build
  writes `.gz` and `.br` sidecars next to every artifact; the proxy is expected
  to serve them via its _static_ pre-compression (gzip/brotli), so nothing is
  recompressed per request. Sidecars sit in the per-day directory and swap
  atomically with the blob, so they never go stale.
- **A tile proxy with cache** (server-to-server to swisstopo) — the client talks
  **only** to our server, never to third-party hosts (for all assets, fonts,
  maps).
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
  daily artifact of the planned timetable (columnar, little-endian; the rail
  network geometry stored once as a shared edge list, each trip a reference into
  it). Consumed by the Heartbeat panel.
