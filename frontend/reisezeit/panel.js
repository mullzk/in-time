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
import { formatDuration, formatThroughRide, formatWait } from './labels.js';

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
const LEG_COLOR = [32, 54, 104, 150];
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

// Small dots first, so a bus stop is not left sitting on top of the interchange
// it belongs to.
const bySmallestNodeFirst = (first, second) =>
  nodeDiameterOfCategory(first.category) -
  nodeDiameterOfCategory(second.category);

const RING_COLOR = [214, 214, 210];
const RING_LABEL_COLOR = [140, 142, 145];
const CENTRE_COLOR = [20, 22, 26];
const LABEL_BACKGROUND = [28, 30, 34, 235];
const LABEL_TEXT_COLOR = [245, 246, 248];
const HIGHLIGHT_COLOR = [20, 22, 26];

const CENTRE_DIAMETER_PIXELS = 9;
const HIGHLIGHT_WIDTH_PIXELS = 1.5;
const HIGHLIGHT_LEG_WIDTH_PIXELS = 2.5;
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

// Places are grouped by how far out they lie and by the vehicle one arrives on,
// so a frame sets one fill per group instead of one per dot.
const groupKey = (band, category) => `${band}:${category}`;

const NO_PLACE = -1;

// A single valley served once a day reaches hours beyond the rest, and opening
// on the whole tree would shrink everything else around it. The view therefore
// starts a little way in; one key (F) pulls it back to all of it.
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

  // The road blob arrives after the first picture already stands, so the whole
  // connection list is rebuilt around it.
  adoptSchedule(buffer, stations) {
    this.catalog.addPublished(stations, readStationPoints(buffer));
    this.networks.push({
      trips: new VehiclePositionEngine(buffer).trips,
      stations,
    });
    this.connections = buildConnectionList(this.networks);
    this.scan = new ConnectionScan(this.connections);
    this.#settleOnAStartStation();
    // Someone is already looking, so the view stays where it was put -- unless
    // it is still the panel's own starting point, which nobody has framed yet,
    // or there was no picture to look at at all.
    this.#rescan({
      openTheView:
        this.startStationChoice.drawnByThePanel || !this.viewHasReachedAPicture,
    });
  }

  // Nothing more is on its way, so a stop the address names that no schedule
  // knows is not going to turn up: the picture stops waiting for it and is drawn
  // from a stop of the panel's own.
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

  // A finger has no hover to read the label with, so its first tap on a target
  // only names it and its second one travels from it. The mouse, which has
  // hovered the target already, travels on the first click.
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

  // Everything a frame needs is worked out once here, so drawing only reads what
  // it draws.
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

  // The places of the picture, each remembering which stops it gathers, so a leg
  // can be traced back from any of them to the place it left.
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

  // A leg is drawn when it leads from one place to another. It is not when the
  // stop it left has no place of its own, and not when it stays inside one --
  // crossing an interchange on foot is not a journey.
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

  // The vehicle's own last stretch, so a line follows the stops it calls at.
  #legIntoPlace(place) {
    const { servedStation } = this.places[place];
    return servedStation === null ? null : this.tree.legInto(servedStation);
  }

  #rideIntoPlace(place) {
    const { servedStation } = this.places[place];
    return servedStation === null ? null : this.tree.rideInto(servedStation);
  }

  #longestTravelTime() {
    return this.places.reduce(
      (longest, place) => Math.max(longest, place.travelTime),
      0,
    );
  }

  // Zoomed all the way out, everything reachable must be in view -- including
  // the outermost hour ring, which reaches past the last place. The camera
  // therefore learns how big this picture is; on a new starting point it also
  // opens on it.
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
      // Fit first, which is what centres the view on the starting point.
      camera.fit();
      camera.setZoomFraction(INITIAL_ZOOM_FRACTION);
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

  // A place wears the vehicle one arrives on, so an interchange a long-distance
  // train calls at reads larger than the bus stop beside it.
  #drawNodesOfGroup(p, context, { band, category, places }) {
    const diameter =
      nodeDiameterOfCategory(category) * context.camera.worldPerPixel();
    p.noStroke();
    p.fill(...BAND_COLORS[band]);
    places.forEach((place) => {
      p.circle(this.#eastOf(place), this.#northOf(place), diameter);
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
    if (this.hovered.kind === 'place') {
      this.#drawHighlightedPlace(p, this.hovered.index, worldPerPixel);
      return;
    }
    this.#drawHighlightedLeg(p, this.hovered.index, worldPerPixel);
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

  #drawHighlightedLeg(p, place, worldPerPixel) {
    const from = this.#placeLeftBehind(this.#legIntoPlace(place));
    p.stroke(...HIGHLIGHT_COLOR);
    p.strokeWeight(HIGHLIGHT_LEG_WIDTH_PIXELS * worldPerPixel);
    p.line(
      this.#eastOf(from),
      this.#northOf(from),
      this.#eastOf(place),
      this.#northOf(place),
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
    this.#drawHoverLabel(p);
  }

  headline() {
    if (this.startStation === null) {
      return HEADLINE_WHILE_LOADING;
    }
    return `Wenn ich um ${formatTimeOfDay(this.startTimeSeconds)} in ${this.startStation.name} losfahre, wo komme ich heute noch hin?`;
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
      this.#describeBoarding(place, leg),
    ];
  }

  // Whether one got in here -- then the wait counts -- or is riding through,
  // which is worth saying: it explains why one passes without waiting.
  #describeBoarding(place, leg) {
    const ride = this.#rideIntoPlace(place);
    return ride.fromStation === leg.fromStation
      ? formatWait(ride.waitSeconds)
      : formatThroughRide(this.#nameOfStation(ride.fromStation));
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

  // A tree is worked out for one departure, so choosing another one draws the
  // picture again -- from the same station and, since only the reach changes,
  // without taking the view back to where it started.
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

  // The tree follows only once the slider is let go: every step of a drag would
  // be a whole connection scan, and the picture would rearrange under the hand.
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
