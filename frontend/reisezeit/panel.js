import { readStationPoints } from '../viz-core/blobStations.js';
import { buildConnectionList } from '../viz-core/connectionList.js';
import { ConnectionScan } from '../viz-core/connectionScan.js';
import { Panel } from '../viz-core/panel.js';
import { RadialTravelTimeLayout } from '../viz-core/radialTravelTime.js';
import { StationCatalog } from '../viz-core/stationCatalog.js';
import { VehiclePositionEngine } from '../viz-core/vehiclePositionEngine.js';
import { buildInfoContent } from './infoContent.js';

const SECONDS_PER_HOUR = 3600;
const HOURS_DRAWN = 6;

// Journeys are drawn in bands of half an hour, each band one colour, so a whole
// band goes out as a single shape instead of thousands of coloured lines. The
// ramp runs from the warm light of the first minutes to the cold blue of the
// far corners.
const BAND_SECONDS = 1800;
const BAND_COLORS = [
  [255, 236, 170],
  [255, 205, 120],
  [255, 168, 96],
  [244, 133, 100],
  [214, 106, 130],
  [172, 94, 158],
  [126, 92, 174],
  [86, 94, 173],
  [62, 96, 158],
  [50, 94, 138],
  [44, 88, 118],
  [40, 80, 100],
];
const RING_COLOR = [70, 78, 92];
const RING_LABEL_COLOR = [150, 160, 175];
const CENTRE_COLOR = [255, 255, 255];
const HINT_COLOR = [190, 198, 210];

const CENTRE_DIAMETER_PIXELS = 9;
const LINE_WIDTH_PIXELS = 1;

// Anything beyond the last band's reach joins it, so the far corners keep the
// colour of the longest journeys rather than dropping out of the picture.
const bandOf = (travelTimeSeconds) =>
  Math.min(
    Math.floor(travelTimeSeconds / BAND_SECONDS),
    BAND_COLORS.length - 1,
  );

export class ReisezeitPanel extends Panel {
  capabilities = {
    stationSearch: true,
  };

  constructor(railBuffer, railStations, startTimeSeconds) {
    super();
    this.catalog = new StationCatalog([]);
    this.networks = [];
    this.startTimeSeconds = startTimeSeconds;
    this.startStation = null;
    this.tree = null;
    this.layout = null;
    this.positions = null;
    this.reachedByBand = [];
    this.context = null;
    this.adoptSchedule(railBuffer, railStations);
  }

  stationCatalog() {
    return this.catalog;
  }

  init(context) {
    this.context = context;
  }

  // Takes a further schedule blob into the running panel: its stations join the
  // catalog and its trips join the connection list, which is rebuilt whole --
  // the road blob arrives this way after the first picture.
  adoptSchedule(buffer, stations) {
    this.catalog.addPublished(stations, readStationPoints(buffer));
    this.networks.push({
      trips: new VehiclePositionEngine(buffer).trips,
      stations,
    });
    this.connections = buildConnectionList(this.networks);
    this.scan = new ConnectionScan(this.connections);
    this.#rescan();
  }

  revealStation(station) {
    this.startStation = station;
    this.#rescan();
    this.context?.camera.centerOn(station.east, station.north);
  }

  #rescan() {
    if (this.startStation === null) {
      this.tree = null;
      return;
    }
    const start = this.connections.stationOf(this.startStation.didok);
    if (start === undefined) {
      this.tree = null;
      return;
    }
    this.tree = this.scan.from(start, this.startTimeSeconds);
    this.layout = new RadialTravelTimeLayout(this.startStation);
    this.#layOutReachedStations();
  }

  // Every reached station gets its place in the picture once, and the stations
  // are grouped into the bands they are drawn in, so a frame only reads what it
  // draws.
  #layOutReachedStations() {
    this.positions = new Float64Array(this.connections.stationCount * 2);
    this.placed = new Uint8Array(this.connections.stationCount);
    const reached = this.tree.reachedStations();
    reached.forEach((station) => {
      const entry = this.catalog.entryOf(this.connections.didokOf(station));
      if (entry === null) {
        return;
      }
      const [east, north] = this.layout.positionOf(
        entry,
        this.tree.travelTimeTo(station),
      );
      this.positions[station * 2] = east;
      this.positions[station * 2 + 1] = north;
      this.placed[station] = 1;
    });
    this.reachedByBand = BAND_COLORS.map(() => []);
    reached
      .filter((station) => this.#drawable(station))
      .forEach((station) => {
        this.reachedByBand[bandOf(this.tree.travelTimeTo(station))].push(
          station,
        );
      });
  }

  // A leg is drawn only when both its ends have a place, which a station whose
  // name the catalog never carried does not.
  #drawable(station) {
    const connection = this.tree.arrivedOn(station);
    return (
      connection !== null &&
      this.placed[station] === 1 &&
      this.placed[this.connections.departureStations[connection]] === 1
    );
  }

  drawWorld(p, context) {
    if (this.tree === null) {
      return;
    }
    this.#drawHourRings(p, context);
    this.reachedByBand.forEach((stations, band) => {
      this.#drawBand(p, context, band, stations);
    });
    this.#drawCentre(p, context);
  }

  #drawBand(p, context, band, stations) {
    if (stations.length === 0) {
      return;
    }
    const [red, green, blue] = BAND_COLORS[band];
    p.stroke(red, green, blue, 150);
    p.strokeWeight(LINE_WIDTH_PIXELS * context.camera.worldPerPixel());
    p.noFill();
    p.beginShape(p.LINES);
    stations.forEach((station) => {
      const connection = this.tree.arrivedOn(station);
      const from = this.connections.departureStations[connection];
      p.vertex(this.positions[from * 2], this.positions[from * 2 + 1]);
      p.vertex(this.positions[station * 2], this.positions[station * 2 + 1]);
    });
    p.endShape();
  }

  // The rings say what the picture measures: one hour of travel per ring,
  // wherever one is heading.
  #drawHourRings(p, context) {
    p.noFill();
    p.stroke(...RING_COLOR);
    p.strokeWeight(context.camera.worldPerPixel());
    Array.from({ length: HOURS_DRAWN }).forEach((_, index) => {
      const diameter =
        2 *
        (index + 1) *
        SECONDS_PER_HOUR *
        this.layout.worldMetresPerTravelSecond;
      p.circle(this.startStation.east, this.startStation.north, diameter);
    });
  }

  #drawCentre(p, context) {
    p.noStroke();
    p.fill(...CENTRE_COLOR);
    p.circle(
      this.startStation.east,
      this.startStation.north,
      CENTRE_DIAMETER_PIXELS * context.camera.worldPerPixel(),
    );
  }

  drawOverlay(p, context) {
    if (this.tree === null) {
      this.#drawHint(p);
      return;
    }
    this.#drawRingLabels(p, context);
  }

  #drawHint(p) {
    p.noStroke();
    p.fill(...HINT_COLOR);
    p.textAlign(p.CENTER, p.CENTER);
    p.textSize(16);
    p.text(
      'Wählen Sie einen Standort, um zu sehen, wie weit man von dort kommt.',
      p.width / 2,
      p.height / 2,
    );
  }

  #drawRingLabels(p, context) {
    p.noStroke();
    p.fill(...RING_LABEL_COLOR);
    p.textAlign(p.LEFT, p.CENTER);
    p.textSize(12);
    Array.from({ length: HOURS_DRAWN }).forEach((_, index) => {
      const hours = index + 1;
      const [x, y] = context.camera.worldToScreen(
        this.startStation.east +
          hours * SECONDS_PER_HOUR * this.layout.worldMetresPerTravelSecond,
        this.startStation.north,
      );
      p.text(`${hours} h`, x + 4, y);
    });
  }

  sidebarSections() {
    return [];
  }

  keyBindings() {
    return {};
  }

  infoContent() {
    return buildInfoContent();
  }
}
