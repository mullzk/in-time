import { readStationPoints } from '../viz-core/blobStations.js';
import { formatTimeOfDay } from '../viz-core/clock.js';
import { buildConnectionList } from '../viz-core/connectionList.js';
import { ConnectionScan } from '../viz-core/connectionScan.js';
import { element } from '../viz-core/dom.js';
import { HEADLINE_WHILE_LOADING } from '../viz-core/headline.js';
import { Panel } from '../viz-core/panel.js';
import { placesOfReachedStations } from '../viz-core/places.js';
import {
  StartStationChoice,
  stationToTravelFrom,
} from '../viz-core/startStation.js';
import { StationCatalog } from '../viz-core/stationCatalog.js';
import {
  dominantStationMode,
  nearestStation,
  nodeDiameterPixels,
  stationPickRadiusPixels,
} from '../viz-core/stationNodes.js';
import { SECONDS_PER_DAY } from '../viz-core/timeModel.js';
import {
  byRisingRank,
  CATEGORY_BUS,
  CATEGORY_INTERCITY,
  CATEGORY_INTERREGIO,
  CATEGORY_TRAM,
  categoryColor,
  categoryLabel,
} from '../viz-core/transportCategories.js';
import { VehiclePositionEngine } from '../viz-core/vehiclePositionEngine.js';
import { buildInfoContent } from './infoContent.js';
import { ReachedPlaces } from './reachedPlaces.js';
import { SettledLayer } from './settledLayer.js';

// A place lights up the moment one gets there and then settles into the node it
// keeps: the flash says "just now", the node says "already been". The flash is
// measured in schedule seconds, so it keeps its meaning whatever the tempo.
const FLASH_SECONDS = 480;
const FLASH_EXTRA_DIAMETER_PIXELS = 6;
const SETTLED_ALPHA = 210;

// A node keeps the size the map layer gives it at this zoom, weighted by the
// traffic that reaches it: an interchange a long-distance train calls at reads
// larger than the bus stop beside it, and stays visible close up.
const NODE_SIZE_FACTORS = new Map([
  [CATEGORY_INTERCITY, 2.2],
  [CATEGORY_INTERREGIO, 1.8],
  [CATEGORY_TRAM, 1.1],
  [CATEGORY_BUS, 1],
]);
const REGIONAL_NODE_SIZE_FACTOR = 1.4;
const START_NODE_SIZE_FACTOR = 2.4;

const VEHICLE_DIAMETER_PIXELS = 5;
const START_COLOR = [255, 255, 255];
const START_RING_WIDTH_PIXELS = 1.5;

// Vehicles are smaller and denser than the places, so their tap target stays
// tighter than a station's.
const VEHICLE_HIT_RADIUS_PIXELS = 10;

// The departure can be moved to any moment of the day, in five-minute steps --
// finer would be a false promise, since the picture changes by the timetable.
const DEPARTURE_STEP_SECONDS = 300;

// The place one sets off from is reached by nothing, so it wears no traffic.
const NO_CATEGORY = -1;

const OPAQUE = 255;

const flashAlpha = (freshness) =>
  SETTLED_ALPHA + (OPAQUE - SETTLED_ALPHA) * freshness;

const nodeSizeFactor = (category) =>
  category === NO_CATEGORY
    ? START_NODE_SIZE_FACTOR
    : (NODE_SIZE_FACTORS.get(category) ?? REGIONAL_NODE_SIZE_FACTOR);

export class AusbreitungPanel extends Panel {
  capabilities = {
    simulationSpeed: true,
    timeScrubber: true,
    stationSearch: true,
    stationPicking: true,
    mapBackground: true,
    zoomSlider: true,
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
    this.spreadOnScreen = null;
    this.tree = null;
    this.rides = [];
    this.places = new ReachedPlaces([]);
    this.activeVehicles = [];
    this.settled = null;
    this.currentTimeSeconds = startTimeSeconds;
    this.camera = null;
    this.time = null;
    this.adoptSchedule(railBuffer, railStations);
  }

  stationCatalog() {
    return this.catalog;
  }

  // The spread is light on dark ground: the aerial imagery is dark and low in
  // contrast enough that the lit places read over it, and it says where they
  // are. The chooser stays open for another ground.
  initialBackgroundId() {
    return 'swissview';
  }

  // The spread is computed before there is a clock to run it on, so the clock
  // learns the stretch of day it covers as soon as there is one.
  init(context) {
    this.camera = context.camera;
    this.time = context.time;
    this.#handTheClockItsRange();
  }

  // The road blob arrives after the first picture already stands, so the whole
  // connection list is rebuilt around it.
  adoptSchedule(buffer, stations) {
    const engine = new VehiclePositionEngine(buffer);
    this.catalog.addPublished(stations, readStationPoints(buffer));
    this.networks.push({ engine, trips: engine.trips, stations });
    this.connections = buildConnectionList(this.networks);
    this.scan = new ConnectionScan(this.connections);
    this.#settleOnAStartStation();
    this.#rescan();
  }

  // Nothing more is on its way, so a stop the address names that no schedule
  // knows is not going to turn up: the spread stops waiting for it and sets off
  // from a stop of the panel's own.
  noFurtherScheduleIsComing() {
    this.startStationChoice.noFurtherScheduleIsComing();
    if (this.startStation !== null) {
      return;
    }
    this.#settleOnAStartStation();
    this.#rescan();
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
    this.#rescan();
  }

  // A spread is a picture of the whole country, so a new starting point pulls
  // the view back to all of it rather than moving in on the place itself.
  frameStation(context) {
    context.camera.fit();
  }

  setStartTime(seconds) {
    this.startTimeSeconds = seconds;
    this.#rescan();
  }

  #rescan() {
    const start = this.connections.stationOf(this.startStation?.didok);
    if (start === undefined) {
      this.#showNothingYet();
      return;
    }
    const carriesOnTheSpreadOnScreen = this.#carriesOnTheSpreadOnScreen();
    this.tree = this.scan.from(start, this.startTimeSeconds);
    this.rides = this.#ridesOfTree();
    this.places = new ReachedPlaces(this.#placesOfTree());
    this.settled?.forget();
    this.spreadOnScreen = {
      station: this.startStation,
      departureSeconds: this.startTimeSeconds,
    };
    this.#handTheClockItsRange({
      fromTheBeginning: !carriesOnTheSpreadOnScreen,
    });
  }

  // A spread that gains the buses it was missing is the one already on screen,
  // carried on rather than begun again; another starting point or another
  // departure makes a spread of its own.
  #carriesOnTheSpreadOnScreen() {
    return (
      this.spreadOnScreen !== null &&
      this.spreadOnScreen.station === this.startStation &&
      this.spreadOnScreen.departureSeconds === this.startTimeSeconds
    );
  }

  #showNothingYet() {
    this.tree = null;
    this.rides = [];
    this.places = new ReachedPlaces([]);
    this.settled?.forget();
    this.spreadOnScreen = null;
    this.#handTheClockItsRange();
  }

  // Every vehicle of the tree with what it takes to draw it and to name it in a
  // popover: which blob carries it and which trip of that blob it is.
  #ridesOfTree() {
    return this.tree.rides().map((ride) => ({
      ...ride,
      category: this.connections.categoryOfTrip(ride.trip),
      positionEngineIndex: this.connections.networkOfTrip(ride.trip),
      tripIndex: this.connections.tripInNetwork(ride.trip),
    }));
  }

  #placesOfTree() {
    return placesOfReachedStations(
      this.tree,
      this.connections,
      this.catalog,
    ).map(({ principalStation, members }) =>
      this.#placeOf(principalStation, members),
    );
  }

  #placeOf(principalStation, members) {
    const entry = this.catalog.entryOf(
      this.connections.didokOf(principalStation),
    );
    return {
      entry,
      east: entry.east,
      north: entry.north,
      arrivalTime: Math.min(
        ...members.map((station) => this.tree.arrivalAt(station)),
      ),
      category: this.#bestCategoryReaching(members),
    };
  }

  // A place is worth as much as the best vehicle that reaches it: an interchange
  // an InterCity calls at is no bus stop, however many buses also pull in.
  #bestCategoryReaching(members) {
    const categories = members
      .map((station) => this.tree.arrivedOn(station))
      .filter((connection) => connection !== null)
      .map((connection) =>
        this.connections.categoryOfTrip(this.connections.trips[connection]),
      );
    return categories.length === 0 ? NO_CATEGORY : Math.min(...categories);
  }

  // The spread has a beginning and an end of its own: it starts when one sets
  // off and is over when the last vehicle has landed. A fresh one runs from its
  // beginning, whether or not the last had come to rest; while there is no
  // spread to show, the clock has nothing to count and stands.
  #handTheClockItsRange({ fromTheBeginning = true } = {}) {
    if (this.time === null) {
      return;
    }
    if (this.tree === null) {
      this.time.pause();
      return;
    }
    if (!fromTheBeginning) {
      this.time.setRangeKeepingTime(
        this.startTimeSeconds,
        this.tree.latestArrival(),
      );
      return;
    }
    this.time.setRange(this.startTimeSeconds, this.tree.latestArrival());
    this.time.play();
  }

  ridesRunningAt(seconds) {
    return this.rides.filter(
      (ride) => ride.departureTime <= seconds && seconds <= ride.arrivalTime,
    );
  }

  placesReachedAt(seconds) {
    return this.places.reachedAt(seconds);
  }

  update(currentTimeSeconds) {
    this.currentTimeSeconds = currentTimeSeconds;
    this.activeVehicles = this.#vehiclesRunningAt(currentTimeSeconds);
  }

  // The vehicles as the map deals with them: where they are on the ground, on
  // top of what the ride already says about them.
  #vehiclesRunningAt(seconds) {
    return this.ridesRunningAt(seconds)
      .flatMap((ride) => {
        const position = this.vehiclePosition(ride, seconds);
        return position === null ? [] : [{ ...ride, ...position }];
      })
      .sort(byRisingRank);
  }

  drawWorld(p, context) {
    context.drawTiles(p);
    if (this.tree === null) {
      return;
    }
    this.#drawReachedPlaces(p, context);
    this.#drawVehicles(p, context);
    this.#drawStart(p, context);
  }

  #drawReachedPlaces(p, context) {
    const runs = this.places.runsAt(this.currentTimeSeconds, FLASH_SECONDS);
    const diameterOf = this.#placeDiameter(context.camera);
    this.#drawSettledPlaces(p, context.camera, runs, diameterOf);
    const worldPerPixel = context.camera.worldPerPixel();
    runs.forEach((run) => {
      this.#drawFlashingPlaces(p, run, diameterOf(run.category), worldPerPixel);
    });
  }

  #placeDiameter(camera) {
    const nodeDiameter =
      nodeDiameterPixels(camera.zoomFraction()) * camera.worldPerPixel();
    return (category) => nodeDiameter * nodeSizeFactor(category);
  }

  // The settled places carry the picture and never differ from one another, so
  // they are painted into a layer of their own rather than redrawn every frame.
  #drawSettledPlaces(p, camera, runs, diameterOf) {
    this.#settledLayer(p).paint(camera, runs, diameterOf);
    this.settled.drawOnto(p);
  }

  // The layer holds screen pixels, so a resized canvas needs a new one.
  #settledLayer(p) {
    if (this.settled === null || !this.settled.fitsCanvas(p.width, p.height)) {
      this.settled = new SettledLayer(p, (category) => [
        ...this.#placeColor(category),
        SETTLED_ALPHA,
      ]);
    }
    return this.settled;
  }

  // Each flashing place burns at its own rate, so they are drawn one by one --
  // there are only ever a handful of them.
  #drawFlashingPlaces(p, run, diameter, worldPerPixel) {
    const [red, green, blue] = this.#placeColor(run.category);
    p.noStroke();
    run.easts
      .subarray(run.settledUntil, run.reachedUntil)
      .forEach((east, offset) => {
        const index = run.settledUntil + offset;
        const freshness = this.#freshness(run.arrivals[index]);
        p.fill(red, green, blue, flashAlpha(freshness));
        p.circle(
          east,
          run.norths[index],
          diameter + FLASH_EXTRA_DIAMETER_PIXELS * freshness * worldPerPixel,
        );
      });
  }

  // How recently one got here: one right at the arrival, nothing once the flash
  // has burnt down.
  #freshness(arrivalTime) {
    return Math.max(
      0,
      1 - (this.currentTimeSeconds - arrivalTime) / FLASH_SECONDS,
    );
  }

  #placeColor(category) {
    return category === NO_CATEGORY ? START_COLOR : categoryColor(category);
  }

  #drawVehicles(p, context) {
    const diameter = VEHICLE_DIAMETER_PIXELS * context.camera.worldPerPixel();
    p.noStroke();
    this.activeVehicles.forEach((vehicle) => {
      p.fill(...categoryColor(vehicle.category));
      p.circle(vehicle.east, vehicle.north, diameter);
    });
  }

  // A ring twice the size of the node it encloses, so where one set off stays
  // recognisable however full the picture gets.
  #drawStart(p, context) {
    const ringDiameter = 2 * this.#placeDiameter(context.camera)(NO_CATEGORY);
    p.noFill();
    p.stroke(...START_COLOR);
    p.strokeWeight(START_RING_WIDTH_PIXELS * context.camera.worldPerPixel());
    p.circle(this.startStation.east, this.startStation.north, ringDiameter);
  }

  // The question the picture answers, and where the spread has got to: without
  // the clock nothing would say which moment is on screen.
  headline() {
    if (this.startStation === null) {
      return HEADLINE_WHILE_LOADING;
    }
    return `Wenn ich um ${formatTimeOfDay(this.startTimeSeconds)} in ${this.startStation.name} losfahre, wo bin ich um ${formatTimeOfDay(this.currentTimeSeconds)}?`;
  }

  // Only what is already lit can be picked: the picture answers for where one
  // has got to, not for where one will be later.
  stationNear(screenX, screenY) {
    return this.#nearestReachedPlace(screenX, screenY, null);
  }

  railStationNear(screenX, screenY) {
    return this.#nearestReachedPlace(
      screenX,
      screenY,
      (entry) => dominantStationMode(entry.modes) === 'rail',
    );
  }

  minorStationNear(screenX, screenY) {
    return this.#nearestReachedPlace(
      screenX,
      screenY,
      (entry) => dominantStationMode(entry.modes) !== 'rail',
    );
  }

  #nearestReachedPlace(screenX, screenY, accept) {
    if (this.camera === null) {
      return null;
    }
    const entries = this.placesReachedAt(this.currentTimeSeconds)
      .map((place) => place.entry)
      .filter((entry) => accept === null || accept(entry));
    return nearestStation(
      entries,
      this.camera,
      screenX,
      screenY,
      stationPickRadiusPixels(this.camera.zoomFraction()),
    );
  }

  vehicleAt(screenX, screenY) {
    if (this.camera === null) {
      return null;
    }
    return nearestStation(
      this.activeVehicles,
      this.camera,
      screenX,
      screenY,
      VEHICLE_HIT_RADIUS_PIXELS,
    );
  }

  describeVehicle(vehicle) {
    const { engine, stations } = this.networks[vehicle.positionEngineIndex];
    const { originStation, destinationStation } = engine.tripEndpoints(
      vehicle.tripIndex,
    );
    return {
      label: categoryLabel(vehicle.category),
      category: vehicle.category,
      origin: stations[originStation]?.name,
      destination: stations[destinationStation]?.name,
    };
  }

  vehiclePosition(vehicle, seconds) {
    return this.networks[vehicle.positionEngineIndex].engine.positionAt(
      vehicle.tripIndex,
      seconds,
    );
  }

  infoContent() {
    return buildInfoContent();
  }

  sidebarSections() {
    return [
      {
        id: 'departure',
        title: 'Abfahrt',
        element: this.#departureControl(),
        keepInExhibition: true,
      },
    ];
  }

  #departureControl() {
    const group = element('div', 'sidebar-options');
    const slider = this.#departureSlider();
    const chosenTime = element('p', 'sidebar-hint is-visible');
    chosenTime.textContent = formatTimeOfDay(this.startTimeSeconds);
    // While the slider is moved only the reading follows; the spread is
    // recomputed once the hand lets go of it.
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
    const slider = element('input', 'sidebar-departure');
    slider.type = 'range';
    slider.min = '0';
    slider.max = String(SECONDS_PER_DAY - DEPARTURE_STEP_SECONDS);
    slider.step = String(DEPARTURE_STEP_SECONDS);
    slider.value = String(this.startTimeSeconds);
    return slider;
  }
}
