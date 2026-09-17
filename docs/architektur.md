# Referenz: Architektur

_Grundhaltung: Der Server berechnet einmal täglich vor, der Browser rechnet
daraus, was von der Wahl des Betrachters abhängt. Erlaubt freie Standort-Wahl
ohne jede Serverlast._

## Rechnungs-Verteilung Server ↔ Browser

| Ansicht      | Rechen-Typ                                             | Was                                                             |
| ------------ | ------------------------------------------------------ | --------------------------------------------------------------- |
| `/takt`      | **tägl. vorberechnetes Artefakt**, animiert im Browser | Fahrten-Trajektorien des aktuellen Tages; sonifiziert           |
| `/kaskade`   | **im Browser**                                         | Verbindungs-Scan ab (Start, Zeit), als wachsende Erreichbarkeit |
| `/zeitkarte` | **im Browser**                                         | derselbe Scan, radial als Standbild gezeichnet                  |

- Verbindungs-Scan (Kaskade, Zeitkarte): läuft auf den Blobs, die für die
  Takt-Ansicht ohnehin im Browser liegen — 7.9 ms je Baum gegen 263 ms
  serverseitig in Python. Kein Endpunkt, kein Ergebnis-Cache, keine Anfrage je
  Standortwechsel.
- Sonifikation (Takt): **rein im Browser** aus demselben Tagesartefakt.

## Datenfluss & Artefakt-Formate

- **Bäume (Kaskade, Zeitkarte): kein Format** — sie entstehen und bleiben im
  Browser.
- **Tages-Animations-Artefakte: Custom Binär-Blob** (kolumnare typed arrays) —
  über Netz schnell, kompakt, sofort in p5 nutzbar. **Ein Blob je Netz und
  Tag**, mit dem Netztyp im Header: BAV (Bahn + Tram, über das Schienennetz
  geroutet) und Strasse (Bus, Luftlinien, daher ohne Kanten). Jeder Blob ist
  self-contained und bringt seinen eigenen Stations-Katalog mit (`didok`, Name,
  Modi, Umsteige-Cluster). Der Schnitt isoliert den Bau: ein Bus-Fehler
  blockiert den Bahn-Publish nicht. Alle drei Ansichten laden beide Blobs — den
  Bahn-Blob zuerst, den Strassen-Blob nachgereicht.
- **Täglicher Eager-Build** (nur der eine aktuelle Tag existiert).

## Karten-Integration

- **Keine Kartenbibliothek** (kein MapLibre/Leaflet). **p5 behält die Kamera**;
  Kacheln sind Bilder, die wir selbst im p5-Weltraum platzieren → **ein
  Render-Loop**, automatisch deckungsgleich, kein „Swim".
- **Weltraum = LV95 (EPSG:2056)** (= Projektion der swisstopo-LV95-Kacheln; das
  BAV-Schienennetz ist schon LV95 → keine Umprojektion der Geometrie, nur die
  GTFS-Haltekoordinaten werden einmal reprojiziert). p5 ist
  projektions-agnostisch.
- **Grundprinzip:** Client kommuniziert **nur mit unserem Server** (same-origin,
  relativer Pfad `/tiles/…`). Kacheln liefert **nginx per `proxy_cache`** aus
  swisstopo WMTS — Django ist am Tile-Pfad nicht beteiligt, der Client kennt
  swisstopo nie. Layer-Auswahl steckt im Pfad; Referer setzt nginx serverseitig.
- **Untergrund:** eine Auswahlliste statt eines Reglers — Relief, Landeskarte
  (grau in der Übersicht, ab swisstopo-Level 18 farbig), Luftaufnahme und
  Schwarz (gar keine Kacheln). Jeder Raster-Untergrund trägt die von swisstopo
  geforderte Quellenangabe, der schwarze keine. Die Zeitkarte zeichnet radial
  statt geografisch und führt deshalb gar keinen Untergrund.

## Frontend-Modularisierung (`viz-core`)

- **Framework/Inversion:** `VizCore` besitzt den p5-Loop (Instance-Mode); ein
  Panel erfüllt Hooks. Statische ES-Module, **kein Bundler**.
- **Plug-in-Vertrag:** `capabilities` (deklaratives Manifest, sagt der Shell,
  welche Bedien-Elemente die Ansicht braucht) · `init(context)` ·
  `update(currentTimeSeconds, deltaSeconds)` (deterministisch aus der Zeit) ·
  `drawWorld(p5, context)` (in Kamera-Transformation) ·
  `drawOverlay(p5, context)` (Screen-Space). Alles ausser `drawWorld` ist
  optional; `VizCore` ruft defensiv auf.
- **Gabelungen:** geteiltes Draw · getrennte Zeiten · **Panel komponiert das
  Substrat selbst** (`panelContext.drawTiles()/drawBasemap()/…`) · Fähigkeiten
  **deklarativ** · Ereignis-Reaktion **hybrid** (billiges pullen, teures
  Callback).
- **Ansichts-Wechsel ist immer ein Reload** (entschieden, nicht vorläufig). Der
  Ansichts-Umschalter navigiert; ein Panel wird nie im laufenden Dokument gegen
  ein anderes getauscht, kein Zustand überlebt den Wechsel. Folge: ein
  `teardown()` hätte keinen Aufrufer und steht nicht im Panel-Vertrag — jedes
  Dokument trägt genau ein Panel bis zum Ende seines Lebens.
- **Bausteine:** `VizCore` · `Camera` (LV95-Weltraum, Zoom-/Pan-Grenzen) ·
  `TileLayer` (mit `tileMatrixSet`, dem LV95-Kachelraster) · `TimeModel` ·
  `StationCatalog` (beide Netze vereinigt, Such-Ranking) ·
  `VehiclePositionEngine` (geteilte Klasse, **Instanz je Blob**) ·
  `ConnectionList` + `ConnectionScan` (der Erreichbarkeits-Baum) · `Dock` und
  die übrigen DOM-Bedien-Elemente · `Panel` (Basisklasse) · `PanelContext`
  (kuratierte Fassade auf Kamera, Zeit und Zeichenhilfen, nicht der ganze Core).
- **Sonifikation:** vier Bausteine statt eines. **`SonificationEngine`** ist das
  Geschwister zur `VehiclePositionEngine` — eine Instanz **je Blob**, die dessen
  Halte-Ereignisse nach Station indiziert. Der **`Sonifier`** ist das Uhrwerk:
  er hängt am `TimeModel`, wählt die zu klingenden Ereignisse und
  resynchronisiert nach Scrub, Pause oder Render-Stillstand. Die
  **`AudioBridge`** kapselt die vendorierte Audio-Engine (Sample-Wiedergabe,
  Latenz, Freischalten durch eine Nutzergeste); eine **`Instrumentation`**
  (JSON-Dokument) hält Instrumentierung und Klangtypen, live editierbar im
  `InstrumentationEditor` und im `CustomInstrumentationStore` lokal abgelegt.
- **Gehört wird ein Ort, nicht das Netz:** sonifiziert wird die gewählte
  Station; ein Umsteigeknoten (Cluster aus `transfers.txt`) klingt als ein Ort,
  seine Ereignisse werden über alle Blobs zusammengeführt, die ihn bedienen.
  **Anzeige-Toggles sind zugleich Sound-Mutes** — was nicht sichtbar ist, ist
  auch nicht hörbar.
- **Panel-UI — Schnitt nach Zuständigkeit** (ersetzt die frühere Regel „Panels
  bauen nie DOM"): **Globale** Bedien-Elemente (Untergrund, Zoom, Info,
  Ansichts-Umschalter, Vollbild) gehören der Shell und werden dort gebaut; ein
  Panel erwähnt sie nicht. **Panel-eigene** Bedien-Elemente (Kategorien, Sound)
  liefert das Panel als fertigen DOM-Abschnitt. Geteilte Bausteine liegen in
  `viz-core`, nie im Panel.
- **Deklarativ ist die Abschnitts-Ebene, nicht das Widget:** ein Abschnitt trägt
  eine stabile Kennung und die Angabe, ob er im Ausstellungsmodus überlebt.
  Damit kann die Shell montieren, weglassen, sortieren und den Container
  umschalten, ohne ins Innere zu sehen. Wird die Granularität zu grob, wird der
  Abschnitt geteilt — kein Control-Spec-Schema.
- **Hülle entscheidet die Shell, Verhalten entscheidet das Panel.** Der
  Ausstellungsmodus ist Hülle: die Shell liest `?mode=exhibition` und montiert
  entsprechend; kein eigenes Panel, keine Modus-Abfrage im Panel. Läuft ein
  Panel darin inhaltlich anders (Autoplay, anderer Zeitmodus), ist das
  Panel-Politik über `capabilities`. Engines haben keine UI.

## Backend-Struktur

- **Zwei Django-Apps:** `pipeline` (Build, `BuildRun`) und `web` (Config-/
  Stations-Endpunkte + Seiten). Eine App für die Bäume (`travel`) war vorgesehen
  und entfällt, seit der Scan im Browser läuft. Die Browser-Delivery-App heisst
  `web` (nicht `frontend`), damit ihr Name nicht mit dem JS-Root `frontend/`
  kollidiert.
- **Datenaufteilung:** MariaDB = `BuildRun`. Dateisystem = Tages-Blobs,
  Katalog/Graph, Tile-Cache. **Kein Redis.**
- **Runtime:** gunicorn/WSGI (`--preload`), mise (Python) + uv (Pakete), Nginx
  für Static + Artefakte + Tile-`proxy_cache` (kein WhiteNoise).
- **API:** schlichte Django-Views (kein DRF), JSON.
- **Build-Orchestrierung:** `build_schedule` (laufender Tag) als
  Management-Command, von einem Scheduler angestossen; atomarer Symlink-Swap
  `…/artifacts/current` (Artefakt-Publish, **nicht** der Code-Deploy). Details →
  [daten.md](daten.md).
- **Deployment:** eigener Django-App-Typ im separaten Infrastruktur-Projekt;
  Ansible provisioniert nur, Jobs im Projekt. **Code-Delivery in-place** via
  GitHub Actions (git-pull nach `current/`: `fetch` + `checkout --force <sha>` +
  `clean -fd`, kein `releases/`, kein Symlink, kein Rollback).
