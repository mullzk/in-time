# In Time
Mapping Public Transportation Data

Working title. *In Time* visualises — and makes audible — the rhythm of the
Swiss clock-face timetable (Taktfahrplan): the heartbeat of the country's base
infrastructure. The name carries the double sense of *in time* (musical, in
tempo) and *on time* (Swiss punctuality).

## Product vision & scope

A web app as a **gallery of five views** onto the same public-transport data,
each a distinct perspective:

1. **Spread** — how reachability spreads out from a location over time
   (wildfire).
2. **Travel-time graph** — a radial still image of travel times from a
   location.
3. **Heartbeat** — the day's timetable as a pulsing motion; also **sonified**.
4. **Delays** — the delays actually measured on a past day.
5. **Hotspots** — aggregated delay hotspots over a freely chosen time range.

**Two usage contexts:** the regular web app and an **exhibition mode** (kiosk,
unattended). Data sources: the GTFS planned timetable, actual (measured) data,
and swisstopo / swissTLM3D geometry — Switzerland-wide, always the **current
day**.

## Expectations toward the infrastructure

*In Time* expects of its runtime environment:

- **A Python application server** behind a **reverse proxy**. The proxy serves
  static files and large artifacts directly (not through the app server), so
  that slow clients never tie up app workers.
- **Static serving** of three paths by the proxy: the frontend assets
  (`STATIC_ROOT`), an **artifact directory** (daily binary blobs), and a
  **tile cache**.
- **A tile proxy with cache** (server-to-server to swisstopo) — the client
  talks **only** to our server, never to third-party hosts (for all assets,
  fonts, maps).
- **A MariaDB database** (per app, with its own user).
- **A scheduler** running **two commands** daily (`build_schedule` for the
  planned timetable, `build_actuals` for the measured data) and alerting on
  failure.
- **An env file** with the configuration/secret values (no hostname, no
  infrastructure reference in the code repo).
- **A persistent data directory** that survives deploys and is shared by the
  app *and* the build commands.
- **Continuous deployment**: on green tests the new version is rolled out.

Implemented in another project (`webapp_infra`).
