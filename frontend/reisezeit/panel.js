import { element } from '../viz-core/controls/dom.js';
import { HEADLINE_WHILE_LOADING } from '../viz-core/controls/headline.js';
import { readStationPoints } from '../viz-core/data/blobStations.js';
import { placesOfReachedStations } from '../viz-core/data/places.js';
import { StationCatalog } from '../viz-core/data/stationCatalog.js';
import {
  CATEGORY_BUS,
  CATEGORY_INTERCITY,
  CATEGORY_INTERREGIO,
  CATEGORY_TRAM,
  categoryLabel,
} from '../viz-core/data/transportCategories.js';
import { HoverInteraction } from '../viz-core/interaction/hoverInteraction.js';
import { TapInteraction } from '../viz-core/interaction/tapInteraction.js';
import { Panel } from '../viz-core/panel.js';
import {
  StartStationChoice,
  stationToTravelFrom,
} from '../viz-core/session/startStation.js';
import { DEPARTURE_STEP_SECONDS } from '../viz-core/time/openingTime.js';
import { SECONDS_PER_DAY } from '../viz-core/time/timeModel.js';
import { formatTimeOfDay } from '../viz-core/time/timeOfDay.js';
import { buildConnectionList } from '../viz-core/travel/connectionList.js';
import { ConnectionScan } from '../viz-core/travel/connectionScan.js';
import { RadialTravelTimeLayout } from '../viz-core/travel/radialTravelTime.js';
import { distanceToSegmentSquared } from '../viz-core/travel/segmentDistance.js';
import { VehiclePositionEngine } from '../viz-core/travel/vehiclePositionEngine.js';
import { buildInfoContent } from './infoContent.js';
import { formatRideWithWait, formatTravelTimeFrom } from './labels.js';

const SECONDS_PER_HOUR = 3600;

// The ground the canvas is cleared to; labels back themselves with it.
const GROUND_COLOR = [16, 18, 22];

// One colour per half hour of travel time; anything beyond the last band
// carries its colour.
const BAND_SECONDS = 1800;
const BAND_COLORS = [
  [70, 220, 130],
  [125, 230, 105],
  [175, 232, 90],
  [220, 226, 85],
  [244, 196, 72],
  [250, 160, 66],
  [250, 124, 70],
  [244, 94, 86],
  [232, 76, 116],
  [208, 70, 148],
  [174, 72, 172],
  [140, 82, 190],
];

// Given in pixels and turned into world units at the current zoom.
const LEG_COLOR = [92, 106, 132, 180];
const LEG_WIDTH_PIXELS = 0.5;
const NODE_DIAMETERS = new Map([
  [CATEGORY_INTERCITY, 8],
  [CATEGORY_INTERREGIO, 4],
  [CATEGORY_TRAM, 2],
  [CATEGORY_BUS, 2],
]);
const REGIONAL_NODE_DIAMETER = 4;

const nodeDiameterOfCategory = (category) =>
  NODE_DIAMETERS.get(category) ?? REGIONAL_NODE_DIAMETER;

const bySmallestNodeFirst = (first, second) =>
  nodeDiameterOfCategory(first.category) -
  nodeDiameterOfCategory(second.category);

const RING_COLOR = [56, 60, 70];
const RING_LABEL_COLOR = [126, 130, 140];
const CENTRE_COLOR = [245, 246, 248];
const LABEL_BACKGROUND = [46, 50, 60, 240];
const LABEL_TEXT_COLOR = [245, 246, 248];
const HIGHLIGHT_COLOR = [255, 255, 255];

const INTERCHANGE_LABEL_COLOR = [176, 182, 194];

const CENTRE_DIAMETER_PIXELS = 9;
const HIGHLIGHT_WIDTH_PIXELS = 1.5;
const HIGHLIGHT_LEG_WIDTH_PIXELS = 2.5;
const INTERCHANGE_WIDTH_PIXELS = 1;
const INTERCHANGE_DIAMETER_PIXELS = 9;
const INTERCHANGE_LABEL_TEXT_SIZE = 10;
const INTERCHANGE_LABEL_GAP_PIXELS = 8;
const NODE_PICK_RADIUS_PIXELS = 7;
const LEG_PICK_RADIUS_PIXELS = 5;
const LABEL_PADDING_PIXELS = 8;
const LABEL_LINE_HEIGHT_PIXELS = 17;
const LABEL_TEXT_SIZE = 13;
const RING_LABEL_GAP_PIXELS = 34;

const bandOf = (travelTimeSeconds) =>
  Math.min(
    Math.floor(travelTimeSeconds / BAND_SECONDS),
    BAND_COLORS.length - 1,
  );

// Grouping places by band and category lets a frame set one fill per group
// instead of one per dot.
const groupKey = (band, category) => `${band}:${category}`;

const NO_PLACE = -1;

const INITIAL_ZOOM_FRACTION = 0.11;

const sameTarget = (first, second) =>
  first.kind === second.kind && first.index === second.index;

// The nearest candidate whose distance stays under the reach, or none at all.
const nearestWithin = (candidates, distanceSquaredOf, reachSquared) =>
  candidates.reduce(
    (best, candidate) => {
      const distance = distanceSquaredOf(candidate);
      return distance < best.distance ? { candidate, distance } : best;
    },
    { candidate: null, distance: reachSquared },
  ).candidate;

const labelSize = (p, lines) => ({
  width:
    Math.max(...lines.map((line) => p.textWidth(line))) +
    LABEL_PADDING_PIXELS * 2,
  height: lines.length * LABEL_LINE_HEIGHT_PIXELS + LABEL_PADDING_PIXELS * 2,
});

export class ReisezeitPanel extends Panel {
  capabilities = {
    stationSearch: true,
    needsAStation: true,
  };

  constructor(
    railBuffer,
    railStations,
    startTimeSeconds,
    addressedStationSlug = null,
  ) {
    super();
    this.catalog = new StationCatalog([]);
    this.networks = [];
    this.startTimeSeconds = startTimeSeconds;
    this.startStationChoice = new StartStationChoice(addressedStationSlug, {
      drawsOnItsOwn: false,
    });
    this.startStation = null;
    this.viewHasReachedAPicture = false;
    this.tree = null;
    this.layout = null;
    this.positions = null;
    this.placeGroups = [];
    this.places = [];
    this.hourRings = 0;
    this.hovered = null;
    this.previewed = null;
    this.pointer = null;
    this.chooseStation = null;
    this.context = null;
    this.adoptSchedule(railBuffer, railStations);
  }

  stationCatalog() {
    return this.catalog;
  }

  // The place a stop ended up in: its own, or the interchange it belongs to.
  placeOfDidok(didok) {
    const station = this.connections.stationOf(didok);
    return station === undefined ? NO_PLACE : this.placeOfStation[station];
  }

  // The first picture is laid out before there is a camera, so the view is
  // opened once there is one.
  init(context) {
    this.context = context;
    this.#letTheViewReachThePicture(this.tree !== null);
  }

  attachToCanvas(canvasElement, { chooseStation }) {
    this.chooseStation = chooseStation;
    const pick = (x, y) => this.#pick(x, y);
    new HoverInteraction(canvasElement, {
      pick,
      sameTarget,
      onHover: (target) => {
        this.hovered = target;
      },
    });
    new TapInteraction(canvasElement, {
      pick,
      sameTarget,
      onSelect: (target, pointerType) => this.#select(target, pointerType),
      onActivate: (target) => this.#select(target, 'mouse'),
      onPointerDown: () => {},
      onNothingTapped: () => this.#dropPreview(),
    });
  }

  // The road blob arrives after the first picture stands, so the connection
  // list is rebuilt around it.
  adoptSchedule(buffer, stations) {
    this.catalog.addPublished(stations, readStationPoints(buffer));
    this.networks.push({
      trips: new VehiclePositionEngine(buffer).trips,
      stations,
    });
    this.connections = buildConnectionList(this.networks);
    this.scan = new ConnectionScan(this.connections);
    this.#settleOnAStartStation();
    // A view someone has framed stays where it is; the panel's own starting
    // point has not been framed by anyone.
    this.#rescan({
      openTheView:
        this.startStationChoice.drawnByThePanel || !this.viewHasReachedAPicture,
    });
  }

  // A stop the address names that no loaded schedule knows will not turn up any
  // more, so the picture falls back to a station of its own.
  noFurtherScheduleIsComing() {
    this.startStationChoice.noFurtherScheduleIsComing();
    if (this.startStation !== null) {
      return;
    }
    this.#settleOnAStartStation();
    this.#rescan({ openTheView: true });
  }

  #settleOnAStartStation() {
    this.startStation = this.startStationChoice.settleOn(
      this.catalog,
      this.connections,
      this.scan,
      this.startTimeSeconds,
    );
  }

  startsFrom() {
    return this.startStation;
  }

  drawStation() {
    return stationToTravelFrom(
      this.catalog,
      this.connections,
      this.scan,
      this.startTimeSeconds,
    );
  }

  revealStation(station) {
    this.startStation = this.startStationChoice.choose(station);
    this.#dropPreview();
    this.#rescan({ openTheView: true });
  }

  #preview(target) {
    this.previewed = target;
    this.hovered = target;
  }

  #dropPreview() {
    this.previewed = null;
    this.hovered = null;
  }

  // A finger has no hover, so its first tap on a target only names it and the
  // second one travels from it; a mouse has hovered it already.
  #awaitsAnotherTap(target, pointerType) {
    return (
      pointerType !== 'mouse' &&
      (this.previewed === null || !sameTarget(this.previewed, target))
    );
  }

  #select(target, pointerType) {
    if (this.#awaitsAnotherTap(target, pointerType)) {
      this.#preview(target);
      return;
    }
    if (target.kind !== 'place') {
      return;
    }
    this.previewed = null;
    const entry = this.catalog.entryOf(
      this.connections.didokOf(this.places[target.index].station),
    );
    if (entry !== null) {
      this.chooseStation?.(entry);
    }
  }

  #rescan({ openTheView }) {
    const start = this.connections.stationOf(this.startStation?.didok);
    if (start === undefined) {
      this.tree = null;
      return;
    }
    this.tree = this.scan.from(start, this.startTimeSeconds);
    this.layout = new RadialTravelTimeLayout(this.startStation);
    this.#layOutReachedStations();
    this.#letTheViewReachThePicture(openTheView);
  }

  // Everything a frame needs is worked out once here, so drawing only reads it.
  #layOutReachedStations() {
    this.places = this.#placesOfReachedStations();
    this.positions = this.#positionsOfPlaces();
    this.#groupPlacesForDrawing();
    this.hourRings = Math.ceil(this.#longestTravelTime() / SECONDS_PER_HOUR);
  }

  #positionsOfPlaces() {
    const positions = new Float64Array(this.places.length * 2);
    this.places.forEach((place, index) => {
      const entry = this.catalog.entryOf(
        this.connections.didokOf(place.station),
      );
      const [east, north] = this.layout.positionOf(entry, place.travelTime);
      positions[index * 2] = east;
      positions[index * 2 + 1] = north;
    });
    return positions;
  }

  // Each place remembers the stops it gathers, so a leg can be traced back from
  // any of them to the place it left.
  #placesOfReachedStations() {
    this.placeOfStation = new Int32Array(this.connections.stationCount).fill(
      NO_PLACE,
    );
    return placesOfReachedStations(
      this.tree,
      this.connections,
      this.catalog,
    ).map(({ principalStation, members }, index) => {
      members.forEach((station) => {
        this.placeOfStation[station] = index;
      });
      return {
        station: principalStation,
        servedStation: this.#stopTheVehicleCalledAt(members),
        travelTime: this.tree.travelTimeTo(principalStation),
      };
    });
  }

  // The stop the vehicle actually pulled in at; the starting place has none.
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

  #groupPlacesForDrawing() {
    this.placeGroups = this.#groupedPlaces().sort(bySmallestNodeFirst);
    this.drawnLegs = this.placeGroups.flatMap((group) => group.places);
  }

  #groupedPlaces() {
    const groups = new Map();
    this.#placesWithALegOfTheirOwn().forEach((place) => {
      const category = this.connections.categoryOfTrip(
        this.#legIntoPlace(place).trip,
      );
      const band = bandOf(this.places[place].travelTime);
      const key = groupKey(band, category);
      const group = groups.get(key) ?? { band, category, places: [] };
      group.places.push(place);
      groups.set(key, group);
    });
    return [...groups.values()];
  }

  #placesWithALegOfTheirOwn() {
    return this.places
      .map((_, index) => index)
      .filter((place) => this.#hasALegOfItsOwn(place));
  }

  // A leg counts only when it leads from one place to another one: not when the
  // stop it left has no place of its own, and not when it stays inside one.
  #hasALegOfItsOwn(place) {
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

  // The places from the starting point to this one, walked backwards along the
  // leg into each place until nothing leads any further.
  placesOnPathTo(place) {
    const reversed = [];
    let step = place;
    while (this.#hasALegOfItsOwn(step)) {
      reversed.push(step);
      step = this.#placeLeftBehind(this.#legIntoPlace(step));
    }
    reversed.push(step);
    return reversed.reverse();
  }

  // The places on the path arrived at on one trip and left on another; the
  // starting point and the destination are not interchanges.
  interchangesOnPathTo(place) {
    const path = this.placesOnPathTo(place);
    return path.filter(
      (step, index) =>
        index > 0 &&
        index < path.length - 1 &&
        this.#tripIntoPlace(step) !== this.#tripIntoPlace(path[index + 1]),
    );
  }

  #tripIntoPlace(place) {
    return this.#legIntoPlace(place).trip;
  }

  #legIntoPlace(place) {
    const { servedStation } = this.places[place];
    return servedStation === null ? null : this.tree.legInto(servedStation);
  }

  #waitBeforeLegIntoPlace(place) {
    const { servedStation } = this.places[place];
    return servedStation === null
      ? 0
      : this.tree.waitBeforeLegInto(servedStation);
  }

  #longestTravelTime() {
    return this.places.reduce(
      (longest, place) => Math.max(longest, place.travelTime),
      0,
    );
  }

  // The camera bounds have to hold the outermost hour ring, which reaches past
  // the last place.
  #letTheViewReachThePicture(openTheView) {
    const camera = this.context?.camera;
    if (camera === undefined || this.tree === null) {
      return;
    }
    this.viewHasReachedAPicture = true;
    const radius = this.#ringRadius(this.hourRings);
    camera.setWorldBounds({
      eastMin: this.startStation.east - radius,
      eastMax: this.startStation.east + radius,
      northMin: this.startStation.north - radius,
      northMax: this.startStation.north + radius,
    });
    if (openTheView) {
      // Fit first, since that is what centres the view on the starting point.
      camera.fit();
      camera.setZoomFraction(INITIAL_ZOOM_FRACTION);
    }
  }

  drawWorld(p, context) {
    if (this.tree === null) {
      return;
    }
    this.#drawHourRings(p, context);
    this.#drawLegs(p, context);
    this.placeGroups.forEach((group) => {
      this.#drawNodesOfGroup(p, context, group);
    });
    this.#drawHighlight(p, context);
    this.#drawCentre(p, context);
  }

  #eastOf(place) {
    return this.positions[place * 2];
  }

  #northOf(place) {
    return this.positions[place * 2 + 1];
  }

  #drawLegs(p, context) {
    p.noFill();
    p.stroke(...LEG_COLOR);
    p.strokeWeight(LEG_WIDTH_PIXELS * context.camera.worldPerPixel());
    p.beginShape(p.LINES);
    this.drawnLegs.forEach((place) => {
      const from = this.#placeLeftBehind(this.#legIntoPlace(place));
      p.vertex(this.#eastOf(from), this.#northOf(from));
      p.vertex(this.#eastOf(place), this.#northOf(place));
    });
    p.endShape();
  }

  #drawNodesOfGroup(p, context, { band, category, places }) {
    const diameter =
      nodeDiameterOfCategory(category) * context.camera.worldPerPixel();
    p.noStroke();
    p.fill(...BAND_COLORS[band]);
    places.forEach((place) => {
      p.circle(this.#eastOf(place), this.#northOf(place), diameter);
    });
  }

  // One ring per hour of travel time.
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
    // A leg is named by the place it arrives at, so both kinds of target
    // highlight the same journey.
    this.#drawHighlightedPath(p, this.hovered.index, worldPerPixel);
    this.#drawHighlightedInterchanges(p, worldPerPixel);
    this.#drawHighlightedPlace(p, this.hovered.index, worldPerPixel);
  }

  #interchangesOnTheHoveredPath() {
    return this.hovered === null
      ? []
      : this.interchangesOnPathTo(this.hovered.index);
  }

  #drawHighlightedInterchanges(p, worldPerPixel) {
    p.noFill();
    p.stroke(...HIGHLIGHT_COLOR);
    p.strokeWeight(INTERCHANGE_WIDTH_PIXELS * worldPerPixel);
    this.#interchangesOnTheHoveredPath().forEach((place) => {
      p.circle(
        this.#eastOf(place),
        this.#northOf(place),
        INTERCHANGE_DIAMETER_PIXELS * worldPerPixel,
      );
    });
  }

  #drawHighlightedPath(p, place, worldPerPixel) {
    p.noFill();
    p.stroke(...HIGHLIGHT_COLOR);
    p.strokeWeight(HIGHLIGHT_LEG_WIDTH_PIXELS * worldPerPixel);
    p.beginShape();
    this.placesOnPathTo(place).forEach((step) => {
      p.vertex(this.#eastOf(step), this.#northOf(step));
    });
    p.endShape();
  }

  #drawHighlightedPlace(p, place, worldPerPixel) {
    p.noFill();
    p.stroke(...HIGHLIGHT_COLOR);
    p.strokeWeight(HIGHLIGHT_WIDTH_PIXELS * worldPerPixel);
    p.circle(
      this.#eastOf(place),
      this.#northOf(place),
      NODE_PICK_RADIUS_PIXELS * 2 * worldPerPixel,
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
      return;
    }
    this.#drawRingLabels(p, context);
    this.#drawInterchangeLabels(p, context);
    this.#drawHoverLabel(p);
  }

  headline() {
    if (this.startStation === null) {
      return HEADLINE_WHILE_LOADING;
    }
    return `Wenn ich um ${formatTimeOfDay(this.startTimeSeconds)} in ${this.startStation.name} losfahre, wo komme ich heute noch hin?`;
  }

  // Zoomed far out the rings crowd together, so a ring too close to the last
  // labelled one goes unnamed.
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

  #drawLabelOnGround(p, text, x, y, color) {
    const width = p.textWidth(text);
    p.fill(...GROUND_COLOR, 220);
    p.rect(x - 3, y - 8, width + 6, 16, 3);
    p.fill(...color);
    p.text(text, x, y);
  }

  #drawRingLabel(p, text, x, y) {
    this.#drawLabelOnGround(p, text, x, y, RING_LABEL_COLOR);
  }

  #drawInterchangeLabels(p, context) {
    p.noStroke();
    p.textAlign(p.LEFT, p.CENTER);
    p.textSize(INTERCHANGE_LABEL_TEXT_SIZE);
    this.#interchangesOnTheHoveredPath().forEach((place) => {
      const [x, y] = context.camera.worldToScreen(
        this.#eastOf(place),
        this.#northOf(place),
      );
      this.#drawLabelOnGround(
        p,
        this.#nameOfPlace(place),
        x + INTERCHANGE_LABEL_GAP_PIXELS,
        y,
        INTERCHANGE_LABEL_COLOR,
      );
    });
  }

  #drawHoverLabel(p) {
    if (this.hovered === null || this.pointer === null) {
      return;
    }
    const lines = this.describeTarget(this.hovered);
    p.textSize(LABEL_TEXT_SIZE);
    p.textAlign(p.LEFT, p.TOP);
    const { width, height } = labelSize(p, lines);
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

  // The label flips to the other side of the pointer rather than running off
  // the edge of the canvas.
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

  describeTarget({ kind, index }) {
    return kind === 'place'
      ? this.#describePlace(index)
      : this.#describeLeg(index);
  }

  #nameOfPlace(place) {
    return this.#nameOfStation(this.places[place].station);
  }

  #nameOfStation(station) {
    const entry = this.catalog.entryOf(this.connections.didokOf(station));
    return entry === null ? 'Station' : entry.name;
  }

  #describePlace(place) {
    const { travelTime } = this.places[place];
    return [
      this.#nameOfPlace(place),
      travelTime === 0
        ? 'Ausgangspunkt'
        : formatTravelTimeFrom(travelTime, this.startStation.name),
    ];
  }

  #describeLeg(place) {
    const leg = this.#legIntoPlace(place);
    return [
      `${this.#nameOfPlace(this.#placeLeftBehind(leg))} → ${this.#nameOfPlace(place)}`,
      `${categoryLabel(this.connections.categoryOfTrip(leg.trip))}, ${formatRideWithWait(
        leg.arrivalTime - leg.departureTime,
        this.#waitBeforeLegIntoPlace(place),
      )}`,
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
      this.#placeNear(east, north, worldPerPixel) ??
      this.#legNear(east, north, worldPerPixel)
    );
  }

  #placeNear(east, north, worldPerPixel) {
    const nearest = nearestWithin(
      this.places.map((_, place) => place),
      (place) =>
        (this.#eastOf(place) - east) ** 2 + (this.#northOf(place) - north) ** 2,
      (NODE_PICK_RADIUS_PIXELS * worldPerPixel) ** 2,
    );
    return nearest === null ? null : { kind: 'place', index: nearest };
  }

  #legNear(east, north, worldPerPixel) {
    const nearest = nearestWithin(
      this.drawnLegs,
      (place) => this.#distanceToLegSquared(place, east, north),
      (LEG_PICK_RADIUS_PIXELS * worldPerPixel) ** 2,
    );
    return nearest === null ? null : { kind: 'leg', index: nearest };
  }

  #distanceToLegSquared(place, east, north) {
    const from = this.#placeLeftBehind(this.#legIntoPlace(place));
    return distanceToSegmentSquared(
      east,
      north,
      this.#eastOf(from),
      this.#northOf(from),
      this.#eastOf(place),
      this.#northOf(place),
    );
  }

  // A tree holds for one departure, so another one needs a fresh scan; the
  // station is unchanged, so the view stays where it is.
  setStartTime(seconds) {
    this.startTimeSeconds = seconds;
    this.#dropPreview();
    this.#rescan({ openTheView: false });
  }

  controlSections() {
    return [
      {
        id: 'departure',
        title: 'Abfahrtszeit',
        element: this.#departureControl(),
        keepInExhibition: true,
      },
    ];
  }

  // The scan runs only once the slider is let go; every step of a drag would be
  // a whole connection scan.
  #departureControl() {
    const group = element('div', 'control-options');
    const slider = this.#departureSlider();
    const chosenTime = element('p', 'control-hint is-visible');
    chosenTime.textContent = formatTimeOfDay(this.startTimeSeconds);
    slider.addEventListener('input', () => {
      chosenTime.textContent = formatTimeOfDay(Number(slider.value));
    });
    slider.addEventListener('change', () => {
      this.setStartTime(Number(slider.value));
    });
    group.append(slider, chosenTime);
    return group;
  }

  #departureSlider() {
    const slider = element('input', 'control-slider');
    slider.type = 'range';
    slider.min = '0';
    slider.max = String(SECONDS_PER_DAY - DEPARTURE_STEP_SECONDS);
    slider.step = String(DEPARTURE_STEP_SECONDS);
    slider.value = String(this.startTimeSeconds);
    return slider;
  }

  infoContent() {
    return buildInfoContent();
  }
}
