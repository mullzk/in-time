import { readStationPoints } from '../viz-core/blobStations.js';
import { formatTimeOfDay } from '../viz-core/clock.js';
import { buildConnectionList } from '../viz-core/connectionList.js';
import { ConnectionScan } from '../viz-core/connectionScan.js';
import { element } from '../viz-core/dom.js';
import { Panel } from '../viz-core/panel.js';
import { stationToTravelFrom } from '../viz-core/startStation.js';
import { StationCatalog } from '../viz-core/stationCatalog.js';
import {
  dominantStationMode,
  nearestStation,
  nodeDiameterPixels,
} from '../viz-core/stationNodes.js';
import {
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
const FLASH_EXTRA_DIAMETER_PIXELS = 9;
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

// A generous tap target so small nodes stay hittable on touch; zoomed out it
// shrinks towards the floor, or the pick would swallow half the country.
const STATION_HIT_RADIUS_PIXELS = 12;
const STATION_NEAR_MIN_RADIUS_PIXELS = 5;
const VEHICLE_HIT_RADIUS_PIXELS = 10;

// The departure can be moved to any moment of the day, in five-minute steps --
// finer would be a false promise, since the picture changes by the timetable.
const DEPARTURE_STEP_SECONDS = 300;
const SECONDS_PER_DAY = 24 * 3600;

const NO_CATEGORY = -1;

// Drawn from the least structural traffic to the most, so a long-distance train
// is never hidden under the buses around it.
const byRisingRank = (first, second) => second.category - first.category;

const nodeSizeFactor = (category) =>
  category === NO_CATEGORY
    ? START_NODE_SIZE_FACTOR
    : (NODE_SIZE_FACTORS.get(category) ?? REGIONAL_NODE_SIZE_FACTOR);

export class AusbreitungPanel extends Panel {
  capabilities = {
    simulationSpeed: true,
    stationSearch: true,
    stationPicking: true,
    mapBackground: true,
    zoomSlider: true,
  };

  constructor(railBuffer, railStations, startTimeSeconds) {
    super();
    this.catalog = new StationCatalog([]);
    this.networks = [];
    this.startTimeSeconds = startTimeSeconds;
    this.startStation = null;
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

  // Takes a further schedule blob into the running panel: its stations join the
  // catalog and its trips join the connection list, which is rebuilt whole --
  // the road blob arrives this way after the first picture.
  adoptSchedule(buffer, stations) {
    const engine = new VehiclePositionEngine(buffer);
    this.catalog.addPublished(stations, readStationPoints(buffer));
    this.networks.push({ engine, trips: engine.trips, stations });
    this.connections = buildConnectionList(this.networks);
    this.scan = new ConnectionScan(this.connections);
    this.#pickAStartStationIfNobodyChoseOne();
    this.#rescan();
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
  }

  #travelsAnywhere(entry) {
    const station = this.connections.stationOf(entry.didok);
    return (
      this.scan.from(station, this.startTimeSeconds).connections().length > 0
    );
  }

  revealStation(station) {
    this.startStation = station;
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
    if (this.startStation === null) {
      return;
    }
    const start = this.connections.stationOf(this.startStation.didok);
    if (start === undefined) {
      return;
    }
    this.tree = this.scan.from(start, this.startTimeSeconds);
    this.rides = this.#ridesOfTree();
    this.places = new ReachedPlaces(this.#placesOfTree());
    this.settled?.forget();
    this.#handTheClockItsRange();
  }

  // Every vehicle of the tree with what it takes to draw it: which blob carries
  // it, which trip of that blob it is, and what kind of traffic it runs.
  #ridesOfTree() {
    return this.tree.rides().map((ride) => ({
      ...ride,
      category: this.connections.categoryOfTrip(ride.trip),
      network: this.connections.networkOfTrip(ride.trip),
      tripInNetwork: this.connections.tripInNetwork(ride.trip),
    }));
  }

  // An interchange is one place: without that, a station reached by train would
  // light up again for every bus stop around it, and the country would end up
  // yellow wherever a train had been.
  #placesOfTree() {
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
    return [...membersOfPlace.entries()].map(([key, members]) =>
      this.#placeOf(key, members),
    );
  }

  #placeOf(key, members) {
    const entry = this.catalog.entryOf(
      this.connections.didokOf(this.#principalStopOf(key, members)),
    );
    return {
      entry,
      east: entry.east,
      north: entry.north,
      arrivalTime: Math.min(
        ...members.map((station) => this.tree.arrivalAt(station)),
      ),
      category: this.#bestCategoryInto(members),
    };
  }

  // An interchange answers to its own name -- the didok the catalog names it by.
  // Only where that stop is not itself reached does another member speak for it.
  #principalStopOf(key, members) {
    const principal = this.connections.stationOf(key);
    return principal !== undefined && members.includes(principal)
      ? principal
      : members[0];
  }

  // A place is worth as much as the best vehicle that reaches it: an interchange
  // an InterCity calls at is no bus stop, however many buses also pull in.
  #bestCategoryInto(members) {
    return members.reduce((best, station) => {
      const connection = this.tree.arrivedOn(station);
      if (connection === null) {
        return best;
      }
      const category = this.connections.categoryOfTrip(
        this.connections.trips[connection],
      );
      return best === NO_CATEGORY ? category : Math.min(best, category);
    }, NO_CATEGORY);
  }

  // The spread has a beginning and an end of its own: it starts when one sets
  // off and is over when the last vehicle has landed. A fresh one runs from its
  // beginning, whether or not the last had come to rest.
  #handTheClockItsRange() {
    if (this.time === null || this.tree === null) {
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

  positionOfRide(ride, seconds) {
    return this.networks[ride.network].engine.positionAt(
      ride.tripInNetwork,
      seconds,
    );
  }

  update(currentTimeSeconds) {
    this.currentTimeSeconds = currentTimeSeconds;
    this.activeVehicles = this.#vehiclesRunningAt(currentTimeSeconds);
  }

  // The vehicles as the map deals with them: a position, the trip they belong
  // to, and the blob that trip lives in -- what the popover and the picker read.
  #vehiclesRunningAt(seconds) {
    return this.ridesRunningAt(seconds)
      .flatMap((ride) => {
        const position = this.positionOfRide(ride, seconds);
        return position === null
          ? []
          : [
              {
                ...position,
                category: ride.category,
                positionEngineIndex: ride.network,
                tripIndex: ride.tripInNetwork,
              },
            ];
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

  // The settled places carry the picture and never differ from one another, so
  // they are painted into a layer of their own rather than redrawn every frame.
  // Only the few still flashing are drawn one by one, each burning at its own
  // rate.
  #drawReachedPlaces(p, context) {
    const worldPerPixel = context.camera.worldPerPixel();
    const nodeDiameter = nodeDiameterPixels(context.camera.zoomFraction());
    const diameterOf = (category) =>
      nodeDiameter * nodeSizeFactor(category) * worldPerPixel;
    const runs = this.places.runsAt(this.currentTimeSeconds, FLASH_SECONDS);
    this.#settledLayer(p).paint(context.camera, runs, diameterOf);
    this.settled.drawOnto(p);
    runs.forEach((run) => {
      this.#drawFlashingPlaces(p, run, diameterOf(run.category), worldPerPixel);
    });
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

  #drawFlashingPlaces(p, run, diameter, worldPerPixel) {
    const [red, green, blue] = this.#placeColor(run.category);
    p.noStroke();
    run.easts
      .subarray(run.settledUntil, run.reachedUntil)
      .forEach((east, offset) => {
        const index = run.settledUntil + offset;
        const freshness = this.#freshness(run.arrivals[index]);
        p.fill(
          red,
          green,
          blue,
          SETTLED_ALPHA + (255 - SETTLED_ALPHA) * freshness,
        );
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

  #drawStart(p, context) {
    const worldPerPixel = context.camera.worldPerPixel();
    p.noFill();
    p.stroke(...START_COLOR);
    p.strokeWeight(START_RING_WIDTH_PIXELS * worldPerPixel);
    p.circle(
      this.startStation.east,
      this.startStation.north,
      nodeDiameterPixels(context.camera.zoomFraction()) *
        START_NODE_SIZE_FACTOR *
        2 *
        worldPerPixel,
    );
  }

  // The question the picture answers, and where the spread has got to: without
  // the clock nothing would say which moment is on screen.
  headline() {
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
    const radius =
      STATION_NEAR_MIN_RADIUS_PIXELS +
      (STATION_HIT_RADIUS_PIXELS - STATION_NEAR_MIN_RADIUS_PIXELS) *
        this.camera.zoomFraction();
    const entries = this.placesReachedAt(this.currentTimeSeconds)
      .map((place) => place.entry)
      .filter((entry) => accept === null || accept(entry));
    return nearestStation(entries, this.camera, screenX, screenY, radius);
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
      origin: stations[originStation]?.name,
      destination: stations[destinationStation]?.name,
    };
  }

  vehiclePosition(vehicle, currentTimeSeconds) {
    return this.networks[vehicle.positionEngineIndex].engine.positionAt(
      vehicle.tripIndex,
      currentTimeSeconds,
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

  // Moving the departure recomputes the spread and starts it over, so the slider
  // is the one control that changes what is being watched rather than how fast.
  #departureControl() {
    const group = element('div', 'sidebar-options');
    const slider = element('input', 'sidebar-departure');
    slider.type = 'range';
    slider.min = '0';
    slider.max = String(SECONDS_PER_DAY - DEPARTURE_STEP_SECONDS);
    slider.step = String(DEPARTURE_STEP_SECONDS);
    slider.value = String(this.startTimeSeconds);
    const value = element('p', 'sidebar-hint is-visible');
    value.textContent = formatTimeOfDay(this.startTimeSeconds);
    slider.addEventListener('input', () => {
      value.textContent = formatTimeOfDay(Number(slider.value));
    });
    slider.addEventListener('change', () => {
      this.setStartTime(Number(slider.value));
    });
    group.append(slider, value);
    return group;
  }
}
