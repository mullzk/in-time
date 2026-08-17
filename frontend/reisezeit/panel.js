import { readStationPoints } from '../viz-core/blobStations.js';
import { formatTimeOfDay } from '../viz-core/clock.js';
import { buildConnectionList } from '../viz-core/connectionList.js';
import { ConnectionScan } from '../viz-core/connectionScan.js';
import { HoverInteraction } from '../viz-core/hoverInteraction.js';
import { Panel } from '../viz-core/panel.js';
import { RadialTravelTimeLayout } from '../viz-core/radialTravelTime.js';
import { distanceToSegmentSquared } from '../viz-core/segmentDistance.js';
import { stationToTravelFrom } from '../viz-core/startStation.js';
import { StationCatalog } from '../viz-core/stationCatalog.js';
import { TapInteraction } from '../viz-core/tapInteraction.js';
import {
  CATEGORY_BUS,
  CATEGORY_INTERCITY,
  CATEGORY_INTERREGIO,
  CATEGORY_TRAM,
  categoryLabel,
} from '../viz-core/transportCategories.js';
import { VehiclePositionEngine } from '../viz-core/vehiclePositionEngine.js';
import { buildInfoContent } from './infoContent.js';
import { formatDuration, formatWait } from './labels.js';

const SECONDS_PER_HOUR = 3600;
const GROUND_COLOR = [250, 250, 248];

// Journeys are drawn in bands of half an hour, each band one shape rather than
// thousands of coloured lines. The ramp runs from the green of the first minutes
// through orange and red into a red so dark it is nearly black -- six hours out,
// where the day is mostly spent travelling.
const BAND_SECONDS = 1800;
const BAND_COLORS = [
  [40, 160, 90],
  [95, 175, 70],
  [145, 185, 60],
  [195, 190, 55],
  [230, 170, 50],
  [240, 140, 45],
  [235, 110, 45],
  [220, 75, 45],
  [190, 45, 45],
  [150, 30, 40],
  [100, 22, 32],
  [45, 12, 18],
];

// The lines are the skeleton and nothing more: one fine dark blue for all of
// them. What kind of traffic runs where, and how far out it lies, is told by the
// nodes alone -- the long-distance interchanges as the largest dots, the bus
// stops as the smallest. Given in pixels and turned into world units at the
// current zoom, so the picture keeps its look however close the view is.
const EDGE_COLOR = [32, 54, 104, 150];
const EDGE_WIDTH_PIXELS = 0.5;
const NODE_DIAMETERS = new Map([
  [CATEGORY_INTERCITY, 8],
  [CATEGORY_INTERREGIO, 4],
  [CATEGORY_TRAM, 2],
  [CATEGORY_BUS, 2],
]);
const REGIONAL_NODE_DIAMETER = 4;

const nodeDiameterOfCategory = (category) =>
  NODE_DIAMETERS.get(category) ?? REGIONAL_NODE_DIAMETER;

const RING_COLOR = [214, 214, 210];
const RING_LABEL_COLOR = [140, 142, 145];
const CENTRE_COLOR = [20, 22, 26];
const HINT_COLOR = [90, 94, 100];
const LABEL_BACKGROUND = [28, 30, 34, 235];
const LABEL_TEXT_COLOR = [245, 246, 248];
const HIGHLIGHT_COLOR = [20, 22, 26];

const CENTRE_DIAMETER_PIXELS = 9;
const NODE_PICK_RADIUS_PIXELS = 7;
const EDGE_PICK_RADIUS_PIXELS = 5;
const LABEL_PADDING_PIXELS = 8;
const LABEL_LINE_HEIGHT_PIXELS = 17;
const LABEL_TEXT_SIZE = 13;
const RING_LABEL_GAP_PIXELS = 34;

const bandOf = (travelTimeSeconds) =>
  Math.min(
    Math.floor(travelTimeSeconds / BAND_SECONDS),
    BAND_COLORS.length - 1,
  );

// Legs are grouped by how far out they are and by the vehicle running them, so a
// frame draws one shape per group instead of setting a stroke per leg.
const groupKey = (band, category) => `${band}:${category}`;

const NO_PLACE = -1;

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
    this.startStationIsThePanelsOwn = false;
    this.tree = null;
    this.layout = null;
    this.positions = null;
    this.edgeGroups = [];
    this.places = [];
    this.hourRings = 0;
    this.hovered = null;
    this.pointer = null;
    this.chooseStation = null;
    this.context = null;
    this.adoptSchedule(railBuffer, railStations);
  }

  groundColor() {
    return GROUND_COLOR;
  }

  stationCatalog() {
    return this.catalog;
  }

  // Which place in the picture a stop ended up in -- its own, or the interchange
  // it belongs to.
  placeOfDidok(didok) {
    const station = this.connections.stationOf(didok);
    return station === undefined ? NO_PLACE : this.placeOfStation[station];
  }

  // The picture drawn from the station the panel picked itself stands before
  // there is a camera to show it on, so the view is opened once there is one.
  init(context) {
    this.context = context;
    this.#letTheViewReachThePicture(this.tree !== null);
  }

  attachToCanvas(canvasElement, { chooseStation }) {
    this.chooseStation = chooseStation;
    const pick = (x, y) => this.#pick(x, y);
    new HoverInteraction(canvasElement, {
      pick,
      onHover: (target) => {
        this.hovered = target;
      },
      sameTarget: (first, second) =>
        first.kind === second.kind && first.index === second.index,
    });
    new TapInteraction(canvasElement, {
      pick,
      onSelect: (target) => this.#select(target),
      onActivate: (target) => this.#select(target),
      onMiss: () => {},
      sameTarget: (first, second) =>
        first.kind === second.kind && first.index === second.index,
    });
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
    this.#pickAStartStationIfNobodyChoseOne();
    // The road blob arrives while someone is already looking: the picture gains
    // its buses, but the view stays where it was put -- unless it is still the
    // panel's own starting point, which nobody has framed yet.
    this.#rescan({ openTheView: this.startStationIsThePanelsOwn });
  }

  #pickAStartStationIfNobodyChoseOne() {
    if (this.startStation !== null) {
      return;
    }
    this.startStation = stationToTravelFrom(
      this.catalog.entries.filter(
        (entry) => this.connections.stationOf(entry.didok) !== undefined,
      ),
      (entry) => this.#travelsAnywhere(entry),
    );
    this.startStationIsThePanelsOwn = this.startStation !== null;
  }

  #travelsAnywhere(entry) {
    const station = this.connections.stationOf(entry.didok);
    return (
      this.scan.from(station, this.startTimeSeconds).connections().length > 0
    );
  }

  revealStation(station) {
    this.startStation = station;
    this.startStationIsThePanelsOwn = false;
    this.hovered = null;
    this.#rescan({ openTheView: true });
  }

  #select(target) {
    if (target.kind !== 'station') {
      return;
    }
    const entry = this.catalog.entryOf(
      this.connections.didokOf(this.places[target.index].station),
    );
    if (entry !== null) {
      this.chooseStation?.(entry);
    }
  }

  #rescan({ openTheView }) {
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
    this.#letTheViewReachThePicture(openTheView);
  }

  // An interchange is one place, so its stops share one node and one leg into
  // it: without that, Olten would reach Bern and every tram stop of the Bern
  // interchange on its own near-parallel line. Every place is laid out once and
  // the legs are grouped into what they are drawn as, so a frame only reads what
  // it draws.
  #layOutReachedStations() {
    this.places = this.#placesOfReachedStations();
    this.positions = new Float64Array(this.places.length * 2);
    this.places.forEach((place, index) => {
      const entry = this.catalog.entryOf(
        this.connections.didokOf(place.station),
      );
      const [east, north] = this.layout.positionOf(entry, place.travelTime);
      this.positions[index * 2] = east;
      this.positions[index * 2 + 1] = north;
    });
    this.#groupEdges();
    this.hourRings = Math.ceil(this.#longestTravelTime() / SECONDS_PER_HOUR);
  }

  // Gathers the reached stops into places -- one per interchange, one per stop
  // that stands alone -- and remembers which place each stop belongs to.
  #placesOfReachedStations() {
    this.placeOfStation = new Int32Array(this.connections.stationCount).fill(
      NO_PLACE,
    );
    const membersOfPlace = new Map();
    this.tree
      .reachedStations()
      .filter(
        (station) =>
          this.catalog.entryOf(this.connections.didokOf(station)) !== null,
      )
      .forEach((station) => {
        const key =
          this.connections.clusterOf(station) ??
          this.connections.didokOf(station);
        const members = membersOfPlace.get(key) ?? [];
        members.push(station);
        membersOfPlace.set(key, members);
      });
    return [...membersOfPlace.entries()].map(([key, members], index) => {
      members.forEach((station) => {
        this.placeOfStation[station] = index;
      });
      const station = this.#principalStopOf(key, members);
      return {
        station,
        servedStation: this.#stopTheVehicleCalledAt(members),
        travelTime: this.tree.travelTimeTo(station),
      };
    });
  }

  // An interchange answers to its own name -- the didok the catalog names it by,
  // which is the station the lesser stops gather around. Only where that stop is
  // not itself reached does another member speak for it.
  #principalStopOf(key, members) {
    const principal = this.connections.stationOf(key);
    return principal !== undefined && members.includes(principal)
      ? principal
      : members[0];
  }

  // Where the vehicle really pulled in: the leg into the place is drawn from
  // there, so it carries the right kind of traffic. The place one starts at has
  // none.
  #stopTheVehicleCalledAt(members) {
    return (
      members.find((station) => {
        const connection = this.tree.arrivedOn(station);
        return (
          connection !== null &&
          this.connections.arrivalStations[connection] === station
        );
      }) ?? null
    );
  }

  #groupEdges() {
    const groups = new Map();
    this.places
      .map((_, index) => index)
      .filter((place) => this.#drawable(place))
      .forEach((place) => {
        const category = this.connections.categoryOfTrip(
          this.#legIntoPlace(place).trip,
        );
        const band = bandOf(this.places[place].travelTime);
        const key = groupKey(band, category);
        const group = groups.get(key) ?? { band, category, stations: [] };
        group.stations.push(place);
        groups.set(key, group);
      });
    // Small dots first, so a bus stop is not left sitting on top of the
    // interchange it belongs to.
    this.edgeGroups = [...groups.values()].sort(
      (first, second) =>
        nodeDiameterOfCategory(first.category) -
        nodeDiameterOfCategory(second.category),
    );
    this.drawnLegs = this.edgeGroups.flatMap((group) => group.stations);
  }

  // A leg is drawn when it leads from one place to another. It is not when the
  // stop it left has no place of its own, and not when it stays inside one --
  // crossing an interchange on foot is not a journey.
  #drawable(place) {
    const leg = this.#legIntoPlace(place);
    if (leg === null) {
      return false;
    }
    const from = this.#placeLeftBehind(leg);
    return from !== NO_PLACE && from !== place;
  }

  #placeLeftBehind(leg) {
    return this.placeOfStation[leg.fromStation];
  }

  // Where one got on the vehicle that brought one here, not merely the stop it
  // last called at: a line is drawn for a journey one really makes.
  #legIntoPlace(place) {
    const { servedStation } = this.places[place];
    return servedStation === null ? null : this.tree.legInto(servedStation);
  }

  #longestTravelTime() {
    return this.places.reduce(
      (longest, place) => Math.max(longest, place.travelTime),
      0,
    );
  }

  // Zoomed all the way out, everything reachable must be in view -- including
  // the outermost hour ring, which reaches past the last station. The camera
  // therefore learns how big this picture is; on a new starting point it also
  // opens on the whole of it.
  #letTheViewReachThePicture(openTheView) {
    const camera = this.context?.camera;
    if (camera === undefined) {
      return;
    }
    const radius = this.#ringRadius(this.hourRings);
    camera.setWorldBounds({
      eastMin: this.startStation.east - radius,
      eastMax: this.startStation.east + radius,
      northMin: this.startStation.north - radius,
      northMax: this.startStation.north + radius,
    });
    if (openTheView) {
      camera.fit();
    }
  }

  drawWorld(p, context) {
    if (this.tree === null) {
      return;
    }
    this.#drawHourRings(p, context);
    // The whole skeleton first, then the places on top of it: the nodes carry
    // the colour and the kind of traffic, and nothing may bury them.
    this.#drawLegs(p, context);
    this.edgeGroups.forEach((group) => {
      this.#drawNodesOfGroup(p, context, group);
    });
    this.#drawHighlight(p, context);
    this.#drawCentre(p, context);
  }

  #drawLegs(p, context) {
    p.noFill();
    p.stroke(...EDGE_COLOR);
    p.strokeWeight(EDGE_WIDTH_PIXELS * context.camera.worldPerPixel());
    p.beginShape(p.LINES);
    this.drawnLegs.forEach((place) => {
      const from = this.#placeLeftBehind(this.#legIntoPlace(place));
      p.vertex(this.positions[from * 2], this.positions[from * 2 + 1]);
      p.vertex(this.positions[place * 2], this.positions[place * 2 + 1]);
    });
    p.endShape();
  }

  // A place wears the vehicle one arrives on, so an interchange a long-distance
  // train calls at reads larger than the bus stop beside it.
  #drawNodesOfGroup(p, context, { band, category, stations }) {
    const diameter =
      nodeDiameterOfCategory(category) * context.camera.worldPerPixel();
    p.noStroke();
    p.fill(...BAND_COLORS[band]);
    stations.forEach((station) => {
      p.circle(
        this.positions[station * 2],
        this.positions[station * 2 + 1],
        diameter,
      );
    });
  }

  // The rings say what the picture measures: one hour of travel per ring,
  // whichever way one is heading.
  #drawHourRings(p, context) {
    p.noFill();
    p.stroke(...RING_COLOR);
    p.strokeWeight(context.camera.worldPerPixel());
    Array.from({ length: this.hourRings }).forEach((_, index) => {
      p.circle(
        this.startStation.east,
        this.startStation.north,
        2 * this.#ringRadius(index + 1),
      );
    });
  }

  #ringRadius(hours) {
    return hours * SECONDS_PER_HOUR * this.layout.worldMetresPerTravelSecond;
  }

  #drawHighlight(p, context) {
    if (this.hovered === null) {
      return;
    }
    const worldPerPixel = context.camera.worldPerPixel();
    if (this.hovered.kind === 'station') {
      p.noFill();
      p.stroke(...HIGHLIGHT_COLOR);
      p.strokeWeight(1.5 * worldPerPixel);
      p.circle(
        this.positions[this.hovered.index * 2],
        this.positions[this.hovered.index * 2 + 1],
        NODE_PICK_RADIUS_PIXELS * 2 * worldPerPixel,
      );
      return;
    }
    const from = this.#placeLeftBehind(this.#legIntoPlace(this.hovered.index));
    p.stroke(...HIGHLIGHT_COLOR);
    p.strokeWeight(2.5 * worldPerPixel);
    p.line(
      this.positions[from * 2],
      this.positions[from * 2 + 1],
      this.positions[this.hovered.index * 2],
      this.positions[this.hovered.index * 2 + 1],
    );
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
    this.#drawHoverLabel(p);
  }

  // The question the picture answers, asked out loud, so nobody has to work out
  // what the rings and colours are about.
  headline() {
    return `Wenn ich um ${formatTimeOfDay(this.startTimeSeconds)} in ${this.startStation.name} losfahre, wo komme ich heute noch hin?`;
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

  // Zoomed far out the rings crowd together, and their labels would smear into
  // one another; a ring too close to the last labelled one goes unnamed.
  #drawRingLabels(p, context) {
    p.noStroke();
    p.fill(...RING_LABEL_COLOR);
    p.textAlign(p.LEFT, p.CENTER);
    p.textSize(12);
    Array.from({ length: this.hourRings }).reduce((lastLabelX, _, index) => {
      const hours = index + 1;
      const [x, y] = context.camera.worldToScreen(
        this.startStation.east + this.#ringRadius(hours),
        this.startStation.north,
      );
      if (x - lastLabelX < RING_LABEL_GAP_PIXELS) {
        return lastLabelX;
      }
      this.#drawRingLabel(p, `${hours} h`, x + 4, y);
      return x;
    }, Number.NEGATIVE_INFINITY);
  }

  // The inner rings fall where the tree is densest, so a label carries a little
  // of the ground with it rather than sitting on the lines.
  #drawRingLabel(p, text, x, y) {
    const width = p.textWidth(text);
    p.fill(...GROUND_COLOR, 220);
    p.rect(x - 3, y - 8, width + 6, 16, 3);
    p.fill(...RING_LABEL_COLOR);
    p.text(text, x, y);
  }

  #drawHoverLabel(p) {
    if (this.hovered === null || this.pointer === null) {
      return;
    }
    const lines = this.describeTarget(this.hovered);
    p.textSize(LABEL_TEXT_SIZE);
    p.textAlign(p.LEFT, p.TOP);
    const width =
      Math.max(...lines.map((line) => p.textWidth(line))) +
      LABEL_PADDING_PIXELS * 2;
    const height =
      lines.length * LABEL_LINE_HEIGHT_PIXELS + LABEL_PADDING_PIXELS * 2;
    const [x, y] = this.#labelCorner(p, width, height);
    p.noStroke();
    p.fill(...LABEL_BACKGROUND);
    p.rect(x, y, width, height, 6);
    p.fill(...LABEL_TEXT_COLOR);
    lines.forEach((line, index) => {
      p.text(
        line,
        x + LABEL_PADDING_PIXELS,
        y + LABEL_PADDING_PIXELS + index * LABEL_LINE_HEIGHT_PIXELS,
      );
    });
  }

  // The label follows the pointer but stays on the canvas, flipping to the other
  // side rather than running off the edge.
  #labelCorner(p, width, height) {
    const [pointerX, pointerY] = this.pointer;
    const x =
      pointerX + 14 + width > p.width ? pointerX - 14 - width : pointerX + 14;
    const y =
      pointerY + 14 + height > p.height
        ? pointerY - 14 - height
        : pointerY + 14;
    return [x, y];
  }

  // What the picture says about what the pointer is on: a place with its travel
  // time, or a leg with where it goes, what runs it, how long it takes and how
  // long one waits for it.
  describeTarget({ kind, index }) {
    return kind === 'station'
      ? this.#describeStation(index)
      : this.#describeLeg(index);
  }

  #nameOfPlace(place) {
    const entry = this.catalog.entryOf(
      this.connections.didokOf(this.places[place].station),
    );
    return entry === null ? 'Station' : entry.name;
  }

  #describeStation(place) {
    const { travelTime } = this.places[place];
    return [
      this.#nameOfPlace(place),
      travelTime === 0
        ? 'Ausgangspunkt'
        : `${formatDuration(travelTime)} Reisezeit`,
    ];
  }

  #describeLeg(place) {
    const leg = this.#legIntoPlace(place);
    return [
      `${this.#nameOfPlace(this.#placeLeftBehind(leg))} → ${this.#nameOfPlace(place)}`,
      `${categoryLabel(this.connections.categoryOfTrip(leg.trip))}, ${formatDuration(
        leg.arrivalTime - leg.departureTime,
      )}`,
      formatWait(leg.waitSeconds),
    ];
  }

  #pick(screenX, screenY) {
    this.pointer = [screenX, screenY];
    if (this.tree === null) {
      return null;
    }
    const [east, north] = this.context.camera.screenToWorld(screenX, screenY);
    const worldPerPixel = this.context.camera.worldPerPixel();
    return (
      this.#stationNear(east, north, worldPerPixel) ??
      this.#legNear(east, north, worldPerPixel)
    );
  }

  #stationNear(east, north, worldPerPixel) {
    const reach = (NODE_PICK_RADIUS_PIXELS * worldPerPixel) ** 2;
    const nearest = this.places.reduce(
      (best, _, place) => {
        const distance =
          (this.positions[place * 2] - east) ** 2 +
          (this.positions[place * 2 + 1] - north) ** 2;
        return distance < best.distance ? { place, distance } : best;
      },
      { place: null, distance: reach },
    );
    return nearest.place === null
      ? null
      : { kind: 'station', index: nearest.place };
  }

  #legNear(east, north, worldPerPixel) {
    const reach = (EDGE_PICK_RADIUS_PIXELS * worldPerPixel) ** 2;
    const nearest = this.drawnLegs.reduce(
      (best, place) => {
        const from = this.#placeLeftBehind(this.#legIntoPlace(place));
        const distance = distanceToSegmentSquared(
          east,
          north,
          this.positions[from * 2],
          this.positions[from * 2 + 1],
          this.positions[place * 2],
          this.positions[place * 2 + 1],
        );
        return distance < best.distance ? { place, distance } : best;
      },
      { place: null, distance: reach },
    );
    return nearest.place === null
      ? null
      : { kind: 'leg', index: nearest.place };
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
