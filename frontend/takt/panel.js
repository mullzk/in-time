import { readStationPoints } from '../viz-core/blobStations.js';
import { element } from '../viz-core/dom.js';
import { LongDistancePulse } from '../viz-core/longDistancePulse.js';
import { Panel } from '../viz-core/panel.js';
import { INSTRUMENTATIONS } from '../viz-core/sonification/presets.js';
import { TRANSPORT_GROUPS } from '../viz-core/sonification/scheduling.js';
import { SonificationEngine } from '../viz-core/sonification/sonificationEngine.js';
import { StationCatalog } from '../viz-core/stationCatalog.js';
import {
  dominantStationMode,
  fallbackLayerForStops,
  layerToRevealStation,
  nearestStation,
  nodeDiameterPixels,
  stationIsShown,
  stopsToggleOnZoomCross,
} from '../viz-core/stationNodes.js';
import { BACKGROUNDS } from '../viz-core/tiles/tileSource.js';
import { VehiclePositionEngine } from '../viz-core/vehiclePositionEngine.js';
import { buildInfoContent } from './infoContent.js';

// Colours by blob category: rail 0-4 (Fernverkehr, IR, Regio/RE, S-Bahn, other),
// tram 5, bus 6.
const CATEGORY_COLORS = [
  [240, 90, 70],
  [240, 160, 60],
  [90, 200, 120],
  [90, 170, 240],
  [180, 180, 190],
  [210, 100, 210],
  [240, 205, 70],
];
const FALLBACK_COLOR = [200, 200, 200];

const CATEGORY_INTERCITY = 0;
const CATEGORY_TRAM = 5;
const CATEGORY_BUS = 6;

// Human labels per blob category, shown on a clicked vehicle's popover. Rail
// spans 0-4 (Fernverkehr down to other rail), then tram and bus.
const CATEGORY_LABELS = [
  'Fernverkehr',
  'InterRegio',
  'Regio',
  'S-Bahn',
  'Bahn',
  'Tram',
  'Bus',
];
const categoryLabel = (category) => CATEGORY_LABELS[category] ?? 'Fahrt';

// Rail splits into a long-distance and a regional layer, matching the same two
// display groups used for the sounds: Fernverkehr (categories 0-1) and
// Regionalverkehr (2-4), plus the tram and bus layers.
const LAYER_BY_CATEGORY = new Map([
  [CATEGORY_INTERCITY, 'fernverkehr'],
  [1, 'fernverkehr'],
  [2, 'regionalverkehr'],
  [3, 'regionalverkehr'],
  [4, 'regionalverkehr'],
  [CATEGORY_TRAM, 'tram'],
  [CATEGORY_BUS, 'bus'],
]);

const layerOfCategory = (category) =>
  LAYER_BY_CATEGORY.get(category) ?? 'regionalverkehr';

// The pulse beats for IC and EC alone. InterRegio stops nearly everywhere, so
// counting it would leave half the network glowing and the interchanges would
// stop standing out.
const PULSE_CATEGORIES = new Set([CATEGORY_INTERCITY]);

// Stacking order where points overlap: buses at the bottom, trams above,
// trains on top, so the far more numerous buses never hide the trains.
const DRAW_PRIORITY_BY_CATEGORY = new Map([
  [CATEGORY_BUS, 0],
  [CATEGORY_TRAM, 1],
]);
const drawPriority = (category) => DRAW_PRIORITY_BY_CATEGORY.get(category) ?? 2;

// Trains read poorly against the colour pixel map, so draw them larger and the
// far more numerous trams and buses smaller.
const BASE_DIAMETER_PIXELS = 7;
const DIAMETER_FACTOR_BY_CATEGORY = new Map([
  [CATEGORY_TRAM, 0.75],
  [CATEGORY_BUS, 0.75],
]);
const diameterFactor = (category) =>
  DIAMETER_FACTOR_BY_CATEGORY.get(category) ?? 1.5;

// Whether a vehicle trails the stretch of schedule it has just covered follows
// from the ground it draws on, so it needs no switch of its own: the busier the
// texture underneath, the more the smear reads as mud rather than as movement.
// Empty ground carries it best; the aerial imagery is dense but dark and low in
// contrast enough that the trail still wins, which the drawn maps are not.
const TRAIL_BACKGROUND_IDS = ['black', 'swissview'];
const trailShownOn = (background) =>
  TRAIL_BACKGROUND_IDS.includes(background.id);

// The trail samples the vehicle's own trip backwards in schedule time, so its
// length on screen is the distance actually covered: a fast train smears long,
// a stopping one contracts to its head.
const TRAIL_PARTICLE_PIXELS = 3.4;
const TRAIL_HEAD_ALPHA = 230;
const TRAIL_TAIL_ALPHA = 12;

// How far back a service reaches beyond the plain schedule distance: the trail
// length is the second thing after colour that tells the services apart, and the
// only one left once the pulse turns every train white. Only trains trail -- tram
// and bus run too dense and too short for a smear to read as movement.
const TRAIL_BASE_LENGTH_SECONDS = 84;
const TRAIL_LENGTH_FACTOR_BY_LAYER = new Map([
  ['fernverkehr', 1.25],
  ['regionalverkehr', 2 / 3],
]);
const trailedLayer = (category) =>
  TRAIL_LENGTH_FACTOR_BY_LAYER.has(layerOfCategory(category));

// The gap between samples, in schedule seconds. Long-distance trains both reach
// furthest and move fastest, so at close zoom the same gap tears their trail
// into separate dots; they get a tighter one. The slower, shorter services read
// as a smear at the wide gap and would only cost samples at a tighter one.
const TRAIL_DEFAULT_SPACING_SECONDS = 7;
const TRAIL_SPACING_SECONDS_BY_LAYER = new Map([['fernverkehr', 3]]);

const trailSpacingSeconds = (category) =>
  TRAIL_SPACING_SECONDS_BY_LAYER.get(layerOfCategory(category)) ??
  TRAIL_DEFAULT_SPACING_SECONDS;
const trailSampleCount = (category) =>
  Math.round(
    (TRAIL_BASE_LENGTH_SECONDS *
      TRAIL_LENGTH_FACTOR_BY_LAYER.get(layerOfCategory(category))) /
      trailSpacingSeconds(category),
  );
const trailAlpha = (sample, sampleCount) =>
  TRAIL_HEAD_ALPHA +
  ((TRAIL_TAIL_ALPHA - TRAIL_HEAD_ALPHA) * sample) / (sampleCount - 1);
// Behind a trail the head only has to mark where the vehicle is, so it shrinks
// -- and further still in the far view, where full-size heads would close into a
// carpet of dots and swallow the trails they belong to.
const TRAIL_HEAD_FACTOR_NEAR = 0.55;
const TRAIL_HEAD_FACTOR_FAR = 0.28;
const trailHeadFactor = (zoomFraction) =>
  TRAIL_HEAD_FACTOR_FAR +
  (TRAIL_HEAD_FACTOR_NEAR - TRAIL_HEAD_FACTOR_FAR) * zoomFraction;

// Long-distance trains standing at a station beat as a red node: its size grows
// with the eased count, its opacity saturates at about two trains present.
const PULSE_COLOR = [255, 60, 60];
const PULSE_BASE_DIAMETER_PIXELS = 6;
const PULSE_GROWTH_PIXELS = 10.5;
const PULSE_FULL_OPACITY_INTENSITY = 1.5;
const PULSE_MINIMUM_ALPHA = 60;

// With the pulse on, every train gives up its category colour so the red nodes
// are the only colour left on the map; the trail length still tells the services
// apart.
const PULSE_MODE_VEHICLE_COLOR = [255, 255, 255];

const withinWorldBounds = (bounds, { east, north }) =>
  east >= bounds.eastMin &&
  east <= bounds.eastMax &&
  north >= bounds.northMin &&
  north <= bounds.northMax;

const STATION_NODE_FILL = [255, 255, 255];
// Over a raster background a white node needs an outline; its colour marks the
// station's mode, using the same hues the tram and bus vehicles carry (rail
// keeps a plain black outline). On the black background nodes read on their own.
const STATION_STROKE_BY_MODE = new Map([
  ['rail', [0, 0, 0]],
  ['tram', CATEGORY_COLORS[CATEGORY_TRAM]],
  ['bus', CATEGORY_COLORS[CATEGORY_BUS]],
]);
const STATION_STROKE_WIDTH_PIXELS = 1;
// A generous tap target so small nodes stay hittable on touch.
const STATION_HIT_RADIUS_PIXELS = 12;
// Zoomed out, the full-catalogue pick would swallow every click and the hover
// label would never rest, so its reach shrinks towards this floor as the view
// pulls back, leaving room to aim at a vehicle.
const STATION_NEAR_MIN_RADIUS_PIXELS = 5;
// Vehicles are smaller and denser than station nodes, so keep their tap target
// tighter to avoid grabbing a neighbour.
const VEHICLE_HIT_RADIUS_PIXELS = 10;

// Zoom fraction at and above which the stops layer switches itself on; below it,
// switches off. A manual toggle persists until the next crossing.
const STOPS_ZOOM_THRESHOLD = 0.5;

const LAYER_LABELS = [
  ['network', 'Netz'],
  ['stops', 'Haltestellen'],
  ['fernverkehr', 'Fernverkehr'],
  ['regionalverkehr', 'Regionalverkehr'],
  ['tram', 'Tram'],
  ['bus', 'Bus'],
];

// The pulse mode is a picture, not a layer: the red nodes only read once nothing
// competes with them, so it clears the map down to trains on black and holds the
// controls that would undo that.
const PULSE_MODE_SUPPRESSED_LAYERS = ['tram', 'bus'];
const BLACK_BACKGROUND_ID = 'black';

const didokToIndex = (stations) =>
  new Map(stations.map((station, index) => [station.didok, index]));

const SOUND_STATION_HINT =
  'Sound erklingt erst, wenn eine Station gewählt ist.';

export class TaktPanel extends Panel {
  capabilities = {
    simulationSpeed: true,
    fullDayScrubber: true,
    stationSearch: true,
    sonification: true,
  };

  constructor(railBuffer, railStations) {
    super();
    this.catalog = new StationCatalog([]);
    this.positionEngines = [];
    this.soundEngines = [];
    this.clusterToDidoks = new Map();
    this.adoptSchedule(railBuffer, railStations);
    this.activeVehicles = [];
    this.layers = {
      network: false,
      stops: false,
      fernverkehr: true,
      regionalverkehr: true,
      tram: false,
      bus: false,
    };
    this.pulseMode = false;
    this.longDistancePulse = null;
    this.currentTimeSeconds = 0;
    this.sonifiedStation = null;
    this.soundHint = null;
    this.holdBackground = null;
    this.background = BACKGROUNDS[0];
    this.previousZoomFraction = null;
    this.layerOptions = {};
    this.camera = null;
  }

  stationCatalog() {
    return this.catalog;
  }

  init(context) {
    this.camera = context.camera;
  }

  // Takes a further schedule blob into the running panel: its stations join the
  // catalog, its trips gain an engine and, for sonification, a station-indexed
  // sound engine. The road blob arrives this way after the first picture.
  adoptSchedule(buffer, stations) {
    const points = readStationPoints(buffer);
    this.catalog.addPublished(stations, points);
    // Each engine is paired with the station names its trips index into, so a
    // clicked vehicle resolves to its origin and destination stop names.
    const engine = new VehiclePositionEngine(buffer);
    this.positionEngines.push({ engine, stations });
    this.soundEngines.push({
      engine: new SonificationEngine(engine.trips),
      didokToIndex: didokToIndex(stations),
    });
    // The rail blob is the one the panel is constructed with, and the only one
    // carrying long-distance trips, so the pulse reads the first engine adopted.
    if (this.longDistancePulse === null) {
      this.longDistancePulse = new LongDistancePulse(
        engine.trips,
        engine.stations,
        PULSE_CATEGORIES,
      );
    }
    this.#indexClusters();
  }

  #indexClusters() {
    this.clusterToDidoks = new Map();
    this.catalog.entries.forEach((entry) => {
      if (entry.cluster !== null) {
        const didoks = this.clusterToDidoks.get(entry.cluster);
        if (didoks) {
          didoks.push(entry.didok);
        } else {
          this.clusterToDidoks.set(entry.cluster, [entry.didok]);
        }
      }
    });
  }

  // The merged, time-sorted sound events for a chosen station across the blobs
  // that serve it -- the input the sonifier voices when it is the "ear". A
  // station that belongs to an interchange voices its whole cluster, so a rail
  // stop and its neighbouring tram/bus stops are heard as one place.
  stationSoundEvents(station) {
    const didoks = this.#clusterDidoks(station);
    return this.soundEngines
      .flatMap(({ engine, didokToIndex }) => {
        const indices = didoks
          .map((didok) => didokToIndex.get(didok))
          .filter((index) => index !== undefined);
        return indices.length === 0 ? [] : engine.eventsAtCluster(indices);
      })
      .sort((first, second) => first.time - second.time);
  }

  #clusterDidoks(station) {
    if (station.cluster === null) {
      return [station.didok];
    }
    return this.clusterToDidoks.get(station.cluster) ?? [station.didok];
  }

  // Display toggles double as sound mutes, so a hidden transport group is also
  // silenced.
  hiddenTransportGroups() {
    return TRANSPORT_GROUPS.filter((group) => !this.layers[group]);
  }

  update(currentTimeSeconds, deltaSeconds) {
    this.currentTimeSeconds = currentTimeSeconds;
    this.activeVehicles = this.positionEngines
      .flatMap(({ engine }, positionEngineIndex) =>
        engine.activeAt(currentTimeSeconds).map((vehicle) => {
          vehicle.positionEngineIndex = positionEngineIndex;
          return vehicle;
        }),
      )
      .sort(
        (first, second) =>
          drawPriority(first.category) - drawPriority(second.category),
      );
    if (this.pulseMode) {
      this.longDistancePulse.update(currentTimeSeconds, deltaSeconds);
    }
    this.#syncStopsOnZoomCross();
    this.#syncLayerOptions();
  }

  drawWorld(p, context) {
    context.drawTiles(p);
    if (this.layers.network) {
      this.positionEngines.forEach(({ engine }) => {
        context.drawBasemap(p, engine.edges);
      });
    }
    this.#drawStationNodes(p, context);
    if (this.pulseMode) {
      this.#drawLongDistancePulse(p, context);
    }
    this.#drawVehicles(p, context);
  }

  #drawVehicles(p, context) {
    p.noStroke();
    const bounds = context.camera.visibleWorldBounds();
    const visible = this.activeVehicles.filter(
      (vehicle) =>
        this.#categoryVisible(vehicle.category) &&
        withinWorldBounds(bounds, vehicle),
    );
    this.#drawVehicleTrails(
      p,
      context,
      visible.filter((vehicle) => this.#trailShown(vehicle.category)),
    );
    this.#drawVehicleHeads(p, context, visible);
  }

  #trailShown(category) {
    return trailShownOn(this.background) && trailedLayer(category);
  }

  #drawVehicleHeads(p, context, vehicles) {
    const worldPerPixel = context.camera.worldPerPixel();
    const trailedFactor = trailHeadFactor(context.camera.zoomFraction());
    vehicles.forEach((vehicle) => {
      const [r, g, b] = this.#vehicleColor(vehicle.category);
      p.fill(r, g, b);
      const diameter =
        BASE_DIAMETER_PIXELS *
        diameterFactor(vehicle.category) *
        (this.#trailShown(vehicle.category) ? trailedFactor : 1) *
        worldPerPixel;
      p.circle(vehicle.east, vehicle.north, diameter);
    });
  }

  // Plain alpha, not additive light: additive clips channel by channel, so where
  // a trail's own particles overlap -- densest in the far view, where its whole
  // length falls on a few pixels -- the strongest channel saturates first and the
  // colour drifts to white. Blended, the overlap converges on the vehicle's own
  // colour instead.
  #drawVehicleTrails(p, context, vehicles) {
    const size = TRAIL_PARTICLE_PIXELS * context.camera.worldPerPixel();
    vehicles.forEach((vehicle) => {
      const [r, g, b] = this.#vehicleColor(vehicle.category);
      const sampleCount = trailSampleCount(vehicle.category);
      this.positionEngines[vehicle.positionEngineIndex].engine
        .trailPositions(
          vehicle.tripIndex,
          this.currentTimeSeconds,
          sampleCount,
          trailSpacingSeconds(vehicle.category),
        )
        .forEach(({ east, north }, sample) => {
          p.fill(r, g, b, trailAlpha(sample, sampleCount));
          p.square(east - size / 2, north - size / 2, size);
        });
    });
  }

  #drawLongDistancePulse(p, context) {
    const worldPerPixel = context.camera.worldPerPixel();
    p.noStroke();
    this.longDistancePulse
      .visiblePulses()
      .forEach(({ east, north, intensity }) => {
        const opacity = Math.min(1, intensity / PULSE_FULL_OPACITY_INTENSITY);
        p.fill(
          PULSE_COLOR[0],
          PULSE_COLOR[1],
          PULSE_COLOR[2],
          PULSE_MINIMUM_ALPHA + (255 - PULSE_MINIMUM_ALPHA) * opacity,
        );
        p.circle(
          east,
          north,
          (PULSE_BASE_DIAMETER_PIXELS + PULSE_GROWTH_PIXELS * intensity) *
            worldPerPixel,
        );
      });
  }

  #vehicleColor(category) {
    return this.pulseMode
      ? PULSE_MODE_VEHICLE_COLOR
      : (CATEGORY_COLORS[category] ?? FALLBACK_COLOR);
  }

  sidebarSections({ setInstrumentation, holdBackground } = {}) {
    this.holdBackground = holdBackground;
    const sections = [
      {
        id: 'layers',
        title: 'Ebenen',
        element: this.#layerControl(),
        keepInExhibition: true,
      },
      {
        id: 'pulse',
        title: 'Fernverkehr-Puls',
        element: this.#pulseModeControl(),
        keepInExhibition: true,
        standout: true,
      },
    ];
    if (this.capabilities.sonification) {
      sections.push({
        id: 'sound',
        title: 'Sound',
        element: this.#soundControl(setInstrumentation),
        keepInExhibition: true,
      });
    }
    return sections;
  }

  #pulseModeControl() {
    const group = element('div', 'sidebar-options');
    const input = element('input');
    input.type = 'checkbox';
    input.checked = this.pulseMode;
    input.addEventListener('change', () => this.#setPulseMode(input.checked));
    group.appendChild(this.#option(input, 'Basistakt zeigen'));
    return group;
  }

  // Entering the mode clears the picture down to trains on black -- which brings
  // the trail with it, the black background's own style. Leaving it hands the
  // controls back without undoing the choice, so the view stays where the user
  // was looking.
  #setPulseMode(on) {
    this.pulseMode = on;
    if (on) {
      PULSE_MODE_SUPPRESSED_LAYERS.forEach((layer) => {
        this.layers[layer] = false;
      });
    }
    this.holdBackground?.(on ? BLACK_BACKGROUND_ID : null);
    PULSE_MODE_SUPPRESSED_LAYERS.forEach((layer) => {
      const input = this.layerOptions[layer];
      if (input) {
        input.disabled = on;
      }
    });
  }

  keyBindings() {
    return { h: () => this.toggleStops() };
  }

  infoContent() {
    return buildInfoContent({
      stationSearch: this.capabilities.stationSearch,
    });
  }

  // The shell owns the background chooser; switching one has a consequence only
  // the panel can decide: the pixel maps draw the rail network themselves, so
  // the overlay would only double it.
  onBackgroundChange(background) {
    this.background = background;
    if (background.showsRailwayLines) {
      this.layers.network = false;
    }
  }

  // A single dropdown selects the instrumentation; "Kein Sound" is silence. The
  // sonified station, tempo and per-group mutes come from the existing controls.
  #soundControl(setInstrumentation) {
    const group = element('div', 'sidebar-options');
    const select = element('select', 'sidebar-select');
    const silent = element('option');
    silent.value = '';
    silent.textContent = 'Kein Sound';
    select.appendChild(silent);
    INSTRUMENTATIONS.forEach((_, label) => {
      const option = element('option');
      option.value = label;
      option.textContent = label;
      select.appendChild(option);
    });
    select.addEventListener('change', () => {
      setInstrumentation?.(
        select.value === '' ? null : INSTRUMENTATIONS.get(select.value),
      );
    });
    this.soundHint = element('p', 'sidebar-hint');
    this.soundHint.textContent = SOUND_STATION_HINT;
    this.#syncSoundHint();
    group.append(select, this.soundHint);
    return group;
  }

  // An instrument on its own stays silent: the sonifier voices one chosen
  // station, so until there is one the dropdown looks broken.
  setSonifiedStation(station) {
    this.sonifiedStation = station;
    this.#syncSoundHint();
  }

  #syncSoundHint() {
    this.soundHint?.classList.toggle(
      'is-visible',
      this.sonifiedStation === null,
    );
  }

  #categoryVisible(category) {
    const layer = layerOfCategory(category);
    return !this.#suppressedByPulseMode(layer) && this.layers[layer];
  }

  // The pulse mode's rule about which layers may show, kept in one place so a
  // station search cannot switch a suppressed layer back on behind its back.
  #suppressedByPulseMode(layer) {
    return this.pulseMode && PULSE_MODE_SUPPRESSED_LAYERS.includes(layer);
  }

  // Zooming past the threshold switches the stops layer for the user; a manual
  // toggle then persists until the next crossing.
  #syncStopsOnZoomCross() {
    if (!this.camera) {
      return;
    }
    const fraction = this.camera.zoomFraction();
    if (this.previousZoomFraction !== null) {
      const toggled = stopsToggleOnZoomCross(
        this.previousZoomFraction,
        fraction,
        STOPS_ZOOM_THRESHOLD,
      );
      if (toggled !== null) {
        this.#setStops(toggled);
      }
    }
    this.previousZoomFraction = fraction;
  }

  // A searched station may serve a mode whose vehicle layer is off (a bus or
  // tram stop under the rail defaults); switch that layer on before the stops
  // layer so its node draws and stays tappable.
  revealStation(station) {
    const layer = layerToRevealStation(station.modes, this.layers);
    if (layer && !this.#suppressedByPulseMode(layer)) {
      this.layers[layer] = true;
    }
    this.#setStops(true);
  }

  #setStops(on) {
    this.layers.stops = on;
    if (on) {
      this.#ensureVisibleMode();
    }
  }

  // Stops with every vehicle layer off would draw nothing, so switching them on
  // pulls the trains in too.
  #ensureVisibleMode() {
    const fallback = fallbackLayerForStops(this.layers);
    if (fallback) {
      this.layers[fallback] = true;
    }
  }

  // Layers flip on their own too (background choice, zoom crossing, a search
  // selection), so their checkboxes track the layer state, not the other way.
  #syncLayerOptions() {
    Object.entries(this.layerOptions).forEach(([key, input]) => {
      input.checked = this.layers[key];
    });
  }

  #stationShown(station) {
    return stationIsShown(station.modes, this.layers.stops, this.layers);
  }

  #drawStationNodes(p, context) {
    const diameter =
      nodeDiameterPixels(context.camera.zoomFraction()) *
      context.camera.worldPerPixel();
    const bounds = context.camera.visibleWorldBounds();
    const outlined = this.background.source !== null;
    p.fill(STATION_NODE_FILL[0], STATION_NODE_FILL[1], STATION_NODE_FILL[2]);
    if (outlined) {
      p.strokeWeight(
        STATION_STROKE_WIDTH_PIXELS * context.camera.worldPerPixel(),
      );
    } else {
      p.noStroke();
    }
    this.catalog.entries.forEach((station) => {
      if (this.#stationShown(station) && withinWorldBounds(bounds, station)) {
        if (outlined) {
          const [r, g, b] = STATION_STROKE_BY_MODE.get(
            dominantStationMode(station.modes),
          );
          p.stroke(r, g, b);
        }
        p.circle(station.east, station.north, diameter);
      }
    });
  }

  stationAt(screenX, screenY) {
    if (this.camera === null) {
      return null;
    }
    const shown = this.catalog.entries.filter((station) =>
      this.#stationShown(station),
    );
    return nearestStation(
      shown,
      this.camera,
      screenX,
      screenY,
      STATION_HIT_RADIUS_PIXELS,
    );
  }

  stationNear(screenX, screenY) {
    return this.#nearestCatalogStation(screenX, screenY, null);
  }

  railStationNear(screenX, screenY) {
    return this.#nearestCatalogStation(
      screenX,
      screenY,
      (station) => dominantStationMode(station.modes) === 'rail',
    );
  }

  minorStationNear(screenX, screenY) {
    return this.#nearestCatalogStation(
      screenX,
      screenY,
      (station) => dominantStationMode(station.modes) !== 'rail',
    );
  }

  #nearestCatalogStation(screenX, screenY, accept) {
    if (this.camera === null) {
      return null;
    }
    const radius =
      STATION_NEAR_MIN_RADIUS_PIXELS +
      (STATION_HIT_RADIUS_PIXELS - STATION_NEAR_MIN_RADIUS_PIXELS) *
        this.camera.zoomFraction();
    const candidates = accept
      ? this.catalog.entries.filter(accept)
      : this.catalog.entries;
    return nearestStation(candidates, this.camera, screenX, screenY, radius);
  }

  // Only vehicles whose layer is visible are pickable; nearestStation reads the
  // same east/north an active vehicle carries, so it doubles as the picker.
  vehicleAt(screenX, screenY) {
    if (this.camera === null) {
      return null;
    }
    const visible = this.activeVehicles.filter((vehicle) =>
      this.#categoryVisible(vehicle.category),
    );
    return nearestStation(
      visible,
      this.camera,
      screenX,
      screenY,
      VEHICLE_HIT_RADIUS_PIXELS,
    );
  }

  describeVehicle(vehicle) {
    const { engine, stations } =
      this.positionEngines[vehicle.positionEngineIndex];
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
    return this.positionEngines[vehicle.positionEngineIndex].engine.positionAt(
      vehicle.tripIndex,
      currentTimeSeconds,
    );
  }

  toggleStops() {
    this.#setStops(!this.layers.stops);
  }

  #layerControl() {
    const group = element('div', 'sidebar-options');
    LAYER_LABELS.forEach(([key, label]) => {
      const input = element('input');
      input.type = 'checkbox';
      input.checked = this.layers[key];
      input.addEventListener('change', () => {
        if (key === 'stops') {
          this.#setStops(input.checked);
        } else {
          this.layers[key] = input.checked;
        }
      });
      this.layerOptions[key] = input;
      group.appendChild(this.#option(input, label));
    });
    return group;
  }

  #option(input, label) {
    const option = element('label', 'sidebar-option');
    const text = element('span');
    text.textContent = label;
    option.append(input, text);
    return option;
  }
}
