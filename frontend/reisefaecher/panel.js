import { element } from '../viz-core/controls/dom.js';
import { HEADLINE_WHILE_LOADING } from '../viz-core/controls/headline.js';
import { readStationPoints } from '../viz-core/data/blobStations.js';
import { placesOfReachedStations } from '../viz-core/data/places.js';
import { StationCatalog } from '../viz-core/data/stationCatalog.js';
import {
  byRisingRank,
  CATEGORY_BUS,
  CATEGORY_INTERCITY,
  CATEGORY_INTERREGIO,
  CATEGORY_TRAM,
  categoryColor,
  categoryLabel,
} from '../viz-core/data/transportCategories.js';
import { Panel } from '../viz-core/panel.js';
import {
  dominantStationMode,
  nearestStation,
  nodeDiameterPixels,
  stationPickRadiusPixels,
} from '../viz-core/render/stationNodes.js';
import {
  StartStationChoice,
  stationToTravelFrom,
} from '../viz-core/session/startStation.js';
import { DEPARTURE_STEP_SECONDS } from '../viz-core/time/openingTime.js';
import { SECONDS_PER_DAY } from '../viz-core/time/timeModel.js';
import { formatTimeOfDay } from '../viz-core/time/timeOfDay.js';
import { buildConnectionList } from '../viz-core/travel/connectionList.js';
import { ConnectionScan } from '../viz-core/travel/connectionScan.js';
import { JourneyOnTheGround } from '../viz-core/travel/journeyOnTheGround.js';
import { VehiclePositionEngine } from '../viz-core/travel/vehiclePositionEngine.js';
import { buildInfoContent } from './infoContent.js';
import { ReachedPlaces } from './reachedPlaces.js';
import { SettledLayer } from './settledLayer.js';

// Measured in schedule seconds, so the flash keeps its length at any tempo.
const FLASH_SECONDS = 480;
const FLASH_EXTRA_DIAMETER_PIXELS = 6;
const SETTLED_ALPHA = 210;

// Weights the zoom-dependent node diameter by the traffic reaching the place.
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

const VEHICLE_HIT_RADIUS_PIXELS = 10;

// The line is drawn against the ground it lies on: white on the black one, and
// laid on in black wherever the map itself is light. Thin and half see-through,
// so it traces the journey without covering the places it runs past.
const JOURNEY_ON_BLACK = [255, 255, 255, 150];
const JOURNEY_ON_RASTER = [0, 0, 0, 150];
const JOURNEY_WIDTH_PIXELS = 1.625;
const INTERCHANGE_WIDTH_PIXELS = 1.5;
const INTERCHANGE_DIAMETER_PIXELS = 9;

// What is drawn while no reached place is pointed at.
const NO_JOURNEY = { legs: [], interchanges: [] };

// The place one sets off from is reached by no vehicle, so it has no category.
const NO_CATEGORY = -1;

const OPAQUE = 255;

const flashAlpha = (freshness) =>
  SETTLED_ALPHA + (OPAQUE - SETTLED_ALPHA) * freshness;

const nodeSizeFactor = (category) =>
  category === NO_CATEGORY
    ? START_NODE_SIZE_FACTOR
    : (NODE_SIZE_FACTORS.get(category) ?? REGIONAL_NODE_SIZE_FACTOR);

export class ReisefaecherPanel extends Panel {
  capabilities = {
    simulationSpeed: true,
    stationSearch: true,
    stationPicking: true,
    mapBackground: true,
    needsAStation: true,
    clock: true,
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
    this.journey = NO_JOURNEY;
    this.settled = null;
    this.currentTimeSeconds = startTimeSeconds;
    this.camera = null;
    this.time = null;
    this.adoptSchedule(railBuffer, railStations);
  }

  stationCatalog() {
    return this.catalog;
  }

  initialBackgroundId() {
    return 'black';
  }

  // The spread is computed before there is a clock, so it gets its range here.
  init(context) {
    this.camera = context.camera;
    this.time = context.time;
    this.#handTheClockItsRange();
  }

  // The road blob arrives after the first picture stands, so the connection
  // list is rebuilt around it.
  adoptSchedule(buffer, stations) {
    const engine = new VehiclePositionEngine(buffer);
    this.catalog.addPublished(stations, readStationPoints(buffer));
    this.networks.push({ engine, trips: engine.trips, stations });
    this.connections = buildConnectionList(this.networks);
    this.scan = new ConnectionScan(this.connections);
    this.journeys = new JourneyOnTheGround(
      this.connections,
      this.networks.map((network) => network.engine),
    );
    this.#settleOnAStartStation();
    this.#rescan();
  }

  // A stop the address names that no loaded schedule knows will not turn up any
  // more, so the spread falls back to a station of its own.
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

  // Names the spread on screen, not the departure chosen for the next restart.
  headline() {
    if (this.spreadOnScreen === null) {
      return HEADLINE_WHILE_LOADING;
    }
    const { station, departureSeconds } = this.spreadOnScreen;
    return `Wenn ich um ${formatTimeOfDay(departureSeconds)} in ${station.name} losfahre, und immer optimal umsteige, welche Orte erreiche ich um welche Zeit?`;
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

  frameStation(context) {
    context.camera.fit();
  }

  // Only the departure for the next restart; a running spread keeps running.
  setStartTime(seconds) {
    this.startTimeSeconds = seconds;
  }

  restart() {
    this.#rescan({ againFromTheBeginning: true });
  }

  #rescan({ againFromTheBeginning = false } = {}) {
    const start = this.connections.stationOf(this.startStation?.didok);
    if (start === undefined) {
      this.#showNothingYet();
      return;
    }
    const carriesOnTheSpreadOnScreen =
      !againFromTheBeginning && this.#carriesOnTheSpreadOnScreen();
    this.tree = this.scan.from(start, this.startTimeSeconds);
    this.rides = this.#ridesOfTree();
    this.places = new ReachedPlaces(this.#placesOfTree());
    this.journey = NO_JOURNEY;
    this.settled?.forget();
    this.spreadOnScreen = {
      station: this.startStation,
      departureSeconds: this.startTimeSeconds,
    };
    this.#handTheClockItsRange({
      fromTheBeginning: !carriesOnTheSpreadOnScreen,
    });
  }

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
    this.journey = NO_JOURNEY;
    this.settled?.forget();
    this.spreadOnScreen = null;
    this.#handTheClockItsRange();
  }

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

  // Categories are ranked, so the lowest one is the best vehicle reaching here.
  #bestCategoryReaching(members) {
    const categories = members
      .map((station) => this.tree.arrivedOn(station))
      .filter((connection) => connection !== null)
      .map((connection) =>
        this.connections.categoryOfTrip(this.connections.trips[connection]),
      );
    return categories.length === 0 ? NO_CATEGORY : Math.min(...categories);
  }

  // The spread runs from the departure to the last arrival; without a tree the
  // clock has nothing to count and stands.
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
    this.#drawJourney(p, context);
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

  // Settled places no longer change, so they are painted into a layer of their
  // own rather than redrawn every frame.
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

  // Each flashing place burns at its own rate, so they are drawn one by one.
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

  // One right at the arrival, zero once the flash has burnt down.
  #freshness(arrivalTime) {
    return Math.max(
      0,
      1 - (this.currentTimeSeconds - arrivalTime) / FLASH_SECONDS,
    );
  }

  #placeColor(category) {
    return category === NO_CATEGORY ? START_COLOR : categoryColor(category);
  }

  // A place wears the time it is reached at, which is what the spread is about;
  // a place no journey leads to is only named.
  describeStation(station) {
    const arrival = this.#arrivalAt(station);
    return arrival === null
      ? [station.name]
      : [`${formatTimeOfDay(arrival)} ${station.name}`];
  }

  // The place one sets off from is reached the moment one leaves it, which is a
  // departure and not an arrival.
  #arrivalAt(station) {
    const reached = this.connections.stationOf(station.didok);
    if (this.spreadOnScreen === null || reached === undefined) {
      return null;
    }
    return this.tree.travelTimeTo(reached) === 0
      ? null
      : this.tree.arrivalAt(reached);
  }

  // The journey to the place under the pointer, worked out once here rather
  // than in every frame that draws it. Its interchanges are handed back, since
  // they are named on the map rather than drawn.
  previewJourneyTo(station) {
    this.journey = station === null ? NO_JOURNEY : this.#journeyTo(station);
    return this.journey.interchanges;
  }

  #journeyTo(station) {
    const reached = this.connections.stationOf(station.didok);
    if (
      this.tree === null ||
      reached === undefined ||
      !this.tree.isReached(reached)
    ) {
      return NO_JOURNEY;
    }
    const { legs, interchangeStations } = this.journeys.to(this.tree, reached);
    return {
      legs,
      interchanges: this.#interchangePlacesOf(interchangeStations),
    };
  }

  #interchangePlacesOf(stations) {
    return stations.flatMap((station) => {
      const entry = this.catalog.entryOf(this.connections.didokOf(station));
      return entry === null ? [] : [entry];
    });
  }

  // Each leg is a line of its own, so the step across an interchange stays open
  // rather than being drawn as a ride.
  #drawJourney(p, context) {
    const worldPerPixel = context.camera.worldPerPixel();
    p.noFill();
    p.stroke(...(context.tilesVisible ? JOURNEY_ON_RASTER : JOURNEY_ON_BLACK));
    p.strokeWeight(JOURNEY_WIDTH_PIXELS * worldPerPixel);
    this.journey.legs.forEach((polyline) => {
      p.beginShape();
      polyline.forEach(([east, north]) => {
        p.vertex(east, north);
      });
      p.endShape();
    });
    p.strokeWeight(INTERCHANGE_WIDTH_PIXELS * worldPerPixel);
    this.journey.interchanges.forEach((place) => {
      p.circle(
        place.east,
        place.north,
        INTERCHANGE_DIAMETER_PIXELS * worldPerPixel,
      );
    });
  }

  #drawVehicles(p, context) {
    const diameter = VEHICLE_DIAMETER_PIXELS * context.camera.worldPerPixel();
    p.noStroke();
    this.activeVehicles.forEach((vehicle) => {
      p.fill(...categoryColor(vehicle.category));
      p.circle(vehicle.east, vehicle.north, diameter);
    });
  }

  #drawStart(p, context) {
    const ringDiameter = 2 * this.#placeDiameter(context.camera)(NO_CATEGORY);
    p.noFill();
    p.stroke(...START_COLOR);
    p.strokeWeight(START_RING_WIDTH_PIXELS * context.camera.worldPerPixel());
    p.circle(this.startStation.east, this.startStation.north, ringDiameter);
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
      .filter(accept);
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

  #departureControl() {
    const group = element('div', 'control-options');
    const slider = this.#departureSlider();
    const chosenTime = element('p', 'control-hint is-visible');
    chosenTime.textContent = formatTimeOfDay(this.startTimeSeconds);
    slider.addEventListener('input', () => {
      chosenTime.textContent = formatTimeOfDay(Number(slider.value));
      this.setStartTime(Number(slider.value));
    });
    group.append(slider, chosenTime, this.#restartButton());
    return group;
  }

  #restartButton() {
    const button = element('button', 'control-button');
    button.type = 'button';
    button.textContent = 'Neu starten';
    button.addEventListener('click', () => this.restart());
    return button;
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
}
