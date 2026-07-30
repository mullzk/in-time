import { readStationPoints } from '../viz-core/blobStations.js';
import { element } from '../viz-core/dom.js';
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
  [0, 'fernverkehr'],
  [1, 'fernverkehr'],
  [2, 'regionalverkehr'],
  [3, 'regionalverkehr'],
  [4, 'regionalverkehr'],
  [CATEGORY_TRAM, 'tram'],
  [CATEGORY_BUS, 'bus'],
]);

// Stacking order where points overlap: buses at the bottom, trams above,
// trains on top, so the far more numerous buses never hide the trains.
const DRAW_PRIORITY_BY_CATEGORY = new Map([
  [CATEGORY_BUS, 0],
  [CATEGORY_TRAM, 1],
]);
const drawPriority = (category) => DRAW_PRIORITY_BY_CATEGORY.get(category) ?? 2;

// Fixed, countable zoom stops for the sidebar slider; the wheel and pinch stay
// continuous and the slider snaps to the nearest stop.
const ZOOM_STEPS = 7;

// Trains read poorly against the colour pixel map, so draw them larger and the
// far more numerous trams and buses smaller.
const BASE_DIAMETER_PIXELS = 7;
const DIAMETER_FACTOR_BY_CATEGORY = new Map([
  [CATEGORY_TRAM, 0.75],
  [CATEGORY_BUS, 0.75],
]);
const diameterFactor = (category) =>
  DIAMETER_FACTOR_BY_CATEGORY.get(category) ?? 1.5;

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

export class HerzschlagPanel extends Panel {
  capabilities = {
    simulationSpeed: true,
    fullDayScrubber: true,
    stationSearch: true,
    sonification: true,
  };

  constructor(railBuffer, roadBuffer, railStations, roadStations) {
    super();
    this.railBuffer = railBuffer;
    this.roadBuffer = roadBuffer;
    this.railStations = railStations;
    this.roadStations = roadStations;
    this.catalog = StationCatalog.fromPublished(
      railStations,
      readStationPoints(railBuffer),
      roadStations,
      readStationPoints(roadBuffer),
    );
    this.activeVehicles = [];
    this.layers = {
      network: true,
      stops: false,
      fernverkehr: true,
      regionalverkehr: true,
      tram: false,
      bus: false,
    };
    this.background = BACKGROUNDS[0];
    this.zoomSlider = null;
    this.zoomScrubbing = false;
    this.previousZoomFraction = null;
    this.layerOptions = {};
    this.camera = null;
  }

  stationCatalog() {
    return this.catalog;
  }

  init(context) {
    this.camera = context.camera;
    // Each engine is paired with the station names its trips index into, so a
    // clicked vehicle resolves to its origin and destination stop names.
    this.engineViews = [
      {
        engine: new VehiclePositionEngine(this.railBuffer),
        stations: this.railStations,
      },
      {
        engine: new VehiclePositionEngine(this.roadBuffer),
        stations: this.roadStations,
      },
    ];
    this.engines = this.engineViews.map((view) => view.engine);
    // For sonification each blob is also indexed by station, with a didok lookup
    // so a selected station resolves to its events in whichever blobs serve it.
    this.soundEngines = this.engineViews.map((view) => ({
      engine: new SonificationEngine(view.engine.trips),
      didokToIndex: new Map(
        view.stations.map((station, index) => [station.didok, index]),
      ),
    }));
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

  update(currentTimeSeconds, _deltaSeconds) {
    this.activeVehicles = this.engineViews
      .flatMap((view, engineIndex) =>
        view.engine.activeAt(currentTimeSeconds).map((vehicle) => {
          vehicle.engineIndex = engineIndex;
          return vehicle;
        }),
      )
      .sort(
        (first, second) =>
          drawPriority(first.category) - drawPriority(second.category),
      );
    this.#syncStopsOnZoomCross();
    this.#syncZoomSlider();
    this.#syncLayerOptions();
  }

  drawWorld(p, context) {
    context.drawTiles(p);
    if (this.layers.network) {
      this.engines.forEach((engine) => {
        context.drawBasemap(p, engine.edges);
      });
    }
    this.#drawStationNodes(p, context);

    const worldPerPixel = context.camera.worldPerPixel();
    p.noStroke();
    this.activeVehicles.forEach((vehicle) => {
      if (!this.#categoryVisible(vehicle.category)) {
        return;
      }
      const [r, g, b] = CATEGORY_COLORS[vehicle.category] ?? FALLBACK_COLOR;
      p.fill(r, g, b);
      const diameter =
        BASE_DIAMETER_PIXELS * diameterFactor(vehicle.category) * worldPerPixel;
      p.circle(vehicle.east, vehicle.north, diameter);
    });
  }

  buildSidebarSections(
    context,
    { onBackgroundChange, onInstrumentationChange } = {},
  ) {
    const sections = [
      {
        title: 'Hintergrund',
        element: this.#backgroundControl(context, onBackgroundChange),
      },
      { title: 'Ebenen', element: this.#layerControl() },
      { title: 'Zoom', element: this.#zoomControl(context) },
    ];
    if (this.capabilities.sonification) {
      sections.push({
        title: 'Sound',
        element: this.#soundControl(onInstrumentationChange),
      });
    }
    return sections;
  }

  // A single dropdown selects the instrumentation; "Kein Sound" is silence. The
  // sonified station, tempo and per-group mutes come from the existing controls.
  #soundControl(onInstrumentationChange) {
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
      onInstrumentationChange?.(
        select.value === '' ? null : INSTRUMENTATIONS.get(select.value),
      );
    });
    group.appendChild(select);
    return group;
  }

  #categoryVisible(category) {
    return this.layers[LAYER_BY_CATEGORY.get(category) ?? 'regionalverkehr'];
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
    if (layer) {
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
      if (
        this.#stationShown(station) &&
        station.east >= bounds.eastMin &&
        station.east <= bounds.eastMax &&
        station.north >= bounds.northMin &&
        station.north <= bounds.northMax
      ) {
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
    const view = this.engineViews[vehicle.engineIndex];
    const { originStation, destinationStation } = view.engine.tripEndpoints(
      vehicle.tripIndex,
    );
    return {
      label: categoryLabel(vehicle.category),
      origin: view.stations[originStation]?.name,
      destination: view.stations[destinationStation]?.name,
    };
  }

  vehiclePosition(vehicle, currentTimeSeconds) {
    return this.engineViews[vehicle.engineIndex].engine.positionAt(
      vehicle.tripIndex,
      currentTimeSeconds,
    );
  }

  toggleStops() {
    this.#setStops(!this.layers.stops);
  }

  #backgroundControl(context, onBackgroundChange) {
    const group = element('div', 'sidebar-options');
    BACKGROUNDS.forEach((background, index) => {
      const input = element('input');
      input.type = 'radio';
      input.name = 'background';
      input.checked = index === 0;
      input.addEventListener('change', () => {
        context.setBackground(background.source);
        this.background = background;
        // The pixel maps draw the rail network themselves, so the overlay would
        // only double it: switch it off on selection (the user may re-enable it).
        if (background.showsRailwayLines) {
          this.layers.network = false;
        }
        onBackgroundChange?.();
      });
      group.appendChild(this.#option(input, background.label));
    });
    return group;
  }

  #zoomControl(context) {
    const group = element('div', 'sidebar-options');
    const slider = element('input', 'sidebar-zoom');
    slider.type = 'range';
    slider.min = '0';
    slider.max = String(ZOOM_STEPS - 1);
    slider.step = '1';
    slider.value = String(this.#zoomSliderPosition(context.camera));
    slider.addEventListener('input', () => {
      this.zoomScrubbing = true;
      context.camera.setZoomFraction(Number(slider.value) / (ZOOM_STEPS - 1));
    });
    slider.addEventListener('change', () => {
      this.zoomScrubbing = false;
    });
    this.zoomSlider = slider;
    group.appendChild(slider);
    return group;
  }

  #zoomSliderPosition(camera) {
    return Math.round(camera.zoomFraction() * (ZOOM_STEPS - 1));
  }

  #syncZoomSlider() {
    if (this.zoomSlider && !this.zoomScrubbing && this.camera) {
      this.zoomSlider.value = String(this.#zoomSliderPosition(this.camera));
    }
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
