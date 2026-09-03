# Referenz: Daten & Beschaffung

## Quellen & Kadenz

- **GTFS Soll-Fahrplan** (opentransportdata.swiss) — semiweekly (kalt).
- **BAV-Schienennetz** (swisstopo Open Data, EPSG:2056/LV95) — selten (kalt).
  Für die geografisch echte Linienführung von Bahn und Tram.
- **swisstopo WMTS** (LV95-Kacheln, Relief, Pixelkarte, Luftbild) — Untergrund.

## Tages-Modell

- **Keine Datumswahl; immer der aktuelle Tag.**
- **Täglich Build des laufenden Tages + Löschen des vorherigen** (Eager-Build).
  Gebaut wird der _aktuelle_ Tag (Europe/Zurich), nicht der kommende: der Job
  läuft nach lokaler Mitternacht und baut den Tag, der gerade beginnt.

## Speicherung

| Stufe                                                        | Aufbewahrung                  |
| ------------------------------------------------------------ | ----------------------------- |
| Fahrplan-Tagesartefakt (ein Blob je Netz + Stations-Katalog) | **nur aktueller Tag**         |
| `BuildRun` (Buchhaltung) → **MariaDB**                       | dauerhaft                     |
| Katalog / Graph / Geometrie / Frequenz-Cache                 | bis GTFS-Update (Datei)       |
| GTFS-Soll-Feeds und BAV-Netz (Roh-Archive)                   | behalten (Reproduzierbarkeit) |
| Tile-Cache                                                   | Dateisystem, Nginx-LRU        |

Jedes publizierte Artefakt wird mit `.gz`- und `.br`-Sidecars geschrieben, damit
der Reverse Proxy vorkomprimiert ausliefert.

## Haltestellen-Umfang

- **Auslands-Haltestellen weggelassen.** Eine Fahrt, die das Land verlässt und
  zurückkommt, bleibt als Ganzes drin; nur die ausländischen Halte fallen.
- **Nur regelmässig befahrene Linien** (`FrequencyThresholds`: `min_days` = 300
  Betriebstage im Feed, `min_departures_per_day` = 4). Keine
  touristischen/unregelmässigen Linien. **Asymmetrisch angewandt:** eine Bahn-
  oder Tramfahrt fällt, sobald _eine_ ihrer Verbindungen unregelmässig ist; eine
  Busfahrt bleibt, solange sie _eine_ regelmässige Verbindung hat — sonst
  verschwände eine dichte Stadtlinie, deren Innenstadt-Führung von Tag zu Tag
  variiert, komplett.
- **Keine Seilbahnen/Schiffe.**
- **Umsteigeknoten:** Halte, die laut GTFS `transfers.txt` zusammengehören,
  werden zu Clustern vereinigt (Union-Find über BPUIC) und im Katalog als
  `cluster` geführt — die Sonifikation hört einen ganzen Knoten als einen Ort.

## Geometrie

- **Bahn und Tram:** geografisch echte Linienführung, geroutet über das
  BAV-Schienennetz (LV95) — netzweit, mit Komponenten-Brücken, Multi-Snap,
  Recover und Luftlinien-Fallback. Tram-Halte liegen zu ~100 % auf BAV-Knoten,
  laufen also über dasselbe Netz. Erreichte Quote →
  [performance.md](performance.md).
- **Bus:** **Luftlinie zwischen den Halten**, kein Strassenrouting. Das
  swissTLM3D-Routing war gebaut und wurde zurückgenommen; ein Bus-Leg trägt
  keine Kanten. Der Bus-Halte-Katalog (GTFS→LV95) bleibt.
- Ehrliche Grenze bleibt: grosse Terminals sind approximativ, **nicht
  perron-genau**.

## Build-Orchestrierung

**`build_schedule` — baut den _laufenden_ Tag; hängt am GTFS-Soll-Fahrplan und
am BAV-Netz:**

1. GTFS + BAV-Netz prüfen/holen (Skip, wenn die Version schon publiziert ist).
2. Graph, Kataloge und Frequenz-Cache laden.
3. Beide Tages-Blobs (BAV und Strasse) + beide Stations-Kataloge schreiben.
4. Symlink-Swap, alte Quell-Versionen verwerfen.
5. App-Service reloaden (`SCHEDULE_RELOAD_COMMAND`), damit er den neuen Tag
   sieht.

**Idempotent + Skip-if-done**, `BuildRun` hält den Stand; **atomarer
Symlink-Swap**, damit nie ein halbfertiger Tag ausgeliefert wird. Fehlschlag
alarmiert.
