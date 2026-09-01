import { ChoiceList } from '../viz-core/controls/choiceList.js';
import { pencilIcon } from '../viz-core/controls/dockIcons.js';
import { element } from '../viz-core/controls/dom.js';
import { readStationPoints } from '../viz-core/data/blobStations.js';
import { StationCatalog } from '../viz-core/data/stationCatalog.js';
import {
  CATEGORY_BUS,
  CATEGORY_INTERCITY,
  CATEGORY_INTERREGIO,
  CATEGORY_REGIO,
  CATEGORY_TRAM,
  categoryColor,
  categoryLabel,
  layerOfCategory,
} from '../viz-core/data/transportCategories.js';
import { Panel } from '../viz-core/panel.js';
import {
  dominantStationMode,
  nearestStation,
  nodeDiameterPixels,
  stationPickRadiusPixels,
} from '../viz-core/render/stationNodes.js';
import { BACKGROUNDS } from '../viz-core/render/tiles/tileSource.js';
import {
  fallbackLayerForStops,
  layersDownTo,
  layerToRevealStation,
  stationIsShown,
  stopsToggleOnZoomCross,
} from '../viz-core/render/vehicleLayers.js';
import { drawnStationThatTravels } from '../viz-core/session/startStation.js';
import { INSTRUMENTATIONS } from '../viz-core/sonification/presets.js';
import { TRANSPORT_GROUPS } from '../viz-core/sonification/scheduling.js';
import { SonificationEngine } from '../viz-core/sonification/sonificationEngine.js';
import { VehiclePositionEngine } from '../viz-core/travel/vehiclePositionEngine.js';
import { buildInfoContent } from './infoContent.js';
import { buildWelcomeContent } from './welcomeContent.js';

// Stacking order where points overlap: buses lowest, then trams, trains on top.
const DRAW_PRIORITY_BY_CATEGORY = new Map([
  [CATEGORY_BUS, 0],
  [CATEGORY_TRAM, 1],
]);
const drawPriority = (category) => DRAW_PRIORITY_BY_CATEGORY.get(category) ?? 2;

const BASE_DIAMETER_PIXELS = 7;
const DIAMETER_FACTOR_BY_CATEGORY = new Map([
  [CATEGORY_TRAM, 1],
  [CATEGORY_BUS, 1],
]);
const diameterFactor = (category) =>
  DIAMETER_FACTOR_BY_CATEGORY.get(category) ?? 1.5;

const INITIAL_BACKGROUND_ID = 'black';

// Zoom fraction up to which each background still draws vehicle trails.
const TRAIL_UNTIL_ZOOM_FRACTION_BY_BACKGROUND = new Map([
  ['black', Number.POSITIVE_INFINITY],
  ['swissview', 0.75],
  ['relief', 0.42],
  ['pixel', 0],
]);
export const trailShownOn = (background, zoomFraction) =>
  zoomFraction < TRAIL_UNTIL_ZOOM_FRACTION_BY_BACKGROUND.get(background.id);

const TRAIL_PARTICLE_PIXELS = 3.4;
const TRAIL_HEAD_ALPHA = 230;
const TRAIL_TAIL_ALPHA = 12;

// Only the layers listed here trail; the factor scales the base length.
const TRAIL_BASE_LENGTH_SECONDS = 84;
const TRAIL_LENGTH_FACTOR_BY_LAYER = new Map([
  ['fernverkehr', 1.25],
  ['interregio', 1],
  ['regionalverkehr', 2 / 3],
]);
const trailedLayer = (category) =>
  TRAIL_LENGTH_FACTOR_BY_LAYER.has(layerOfCategory(category));

// The gap between trail samples, in schedule seconds.
const TRAIL_DEFAULT_SPACING_SECONDS = 7;
const TRAIL_SPACING_SECONDS_BY_LAYER = new Map([
  ['fernverkehr', 3],
  ['interregio', 5],
]);

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
// How far the head shrinks while trails are drawn, interpolated over the zoom.
const TRAIL_HEAD_FACTOR_NEAR = 0.55;
const TRAIL_HEAD_FACTOR_FAR = 0.28;
const trailHeadFactor = (zoomFraction) =>
  TRAIL_HEAD_FACTOR_FAR +
  (TRAIL_HEAD_FACTOR_NEAR - TRAIL_HEAD_FACTOR_FAR) * zoomFraction;

const withinWorldBounds = (bounds, { east, north }) =>
  east >= bounds.eastMin &&
  east <= bounds.eastMax &&
  north >= bounds.northMin &&
  north <= bounds.northMax;

const STATION_NODE_FILL = [255, 255, 255];
const STATION_NODE_FILL_ON_BLACK = [64, 64, 64];
const STATION_STROKE_BY_MODE = new Map([
  ['rail', [0, 0, 0]],
  ['tram', categoryColor(CATEGORY_TRAM)],
  ['bus', categoryColor(CATEGORY_BUS)],
]);
const STATION_STROKE_WIDTH_PIXELS = 1;
const VEHICLE_HIT_RADIUS_PIXELS = 10;

// Zoom fraction at and above which the stops layer switches itself on; below it,
// off. A manual toggle persists until the next crossing.
const STOPS_ZOOM_THRESHOLD = 0.5;

const TRAFFIC_LAYERS = [
  ['fernverkehr', 'Fernverkehr', CATEGORY_INTERCITY],
  ['interregio', 'InterRegio', CATEGORY_INTERREGIO],
  ['regionalverkehr', 'Regionalverkehr', CATEGORY_REGIO],
  ['tram', 'Tram / Metro', CATEGORY_TRAM],
  ['bus', 'Bus', CATEGORY_BUS],
];

const GROUND_LAYERS = [
  ['network', 'Streckennetz'],
  ['stops', 'Haltestellen'],
];

const didokToIndex = (stations) =>
  new Map(stations.map((station, index) => [station.didok, index]));

// Keyed by option value, not by name: an own instrumentation may carry the name
// of a delivered one, and then only the value tells them apart.
export const SILENT_OPTION_VALUE = '';
export const CUSTOM_OPTION_VALUE = 'custom';
export const presetOptionValue = (index) => `preset-${index}`;

export function instrumentationForOptionValue(value, customInstrumentation) {
  if (value === CUSTOM_OPTION_VALUE) {
    return customInstrumentation;
  }
  return (
    INSTRUMENTATIONS.find((_, index) => presetOptionValue(index) === value) ??
    null
  );
}

export class TaktPanel extends Panel {
  capabilities = {
    simulationSpeed: true,
    timeScrubber: true,
    stationSearch: true,
    stationPicking: true,
    mapBackground: true,
    clock: true,
    sonification: true,
  };

  constructor(railBuffer, railStations) {
    super();
    this.catalog = new StationCatalog([]);
    this.positionEngines = [];
    this.soundEngines = [];
    this.clusterToDidoks = new Map();
    this.activeVehicles = [];
    this.layers = {
      network: false,
      stops: false,
      fernverkehr: true,
      interregio: true,
      regionalverkehr: true,
      tram: true,
      bus: true,
    };
    this.currentTimeSeconds = 0;
    this.customInstrumentation = null;
    this.customOption = null;
    this.background = BACKGROUNDS.find(
      ({ id }) => id === INITIAL_BACKGROUND_ID,
    );
    this.previousZoomFraction = null;
    this.layerOptions = {};
    this.camera = null;
    this.adoptSchedule(railBuffer, railStations);
  }

  stationCatalog() {
    return this.catalog;
  }

  initialBackgroundId() {
    return INITIAL_BACKGROUND_ID;
  }

  init(context) {
    this.camera = context.camera;
  }

  adoptSchedule(buffer, stations) {
    const points = readStationPoints(buffer);
    this.catalog.addPublished(stations, points);
    // Trips index into their own blob's station list, so each engine keeps it.
    const engine = new VehiclePositionEngine(buffer);
    this.positionEngines.push({ engine, stations });
    this.soundEngines.push({
      engine: new SonificationEngine(engine.trips),
      didokToIndex: didokToIndex(stations),
    });
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

  // Merged and time-sorted across the blobs that serve the station; a station
  // belonging to an interchange contributes its whole cluster.
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

  // Display toggles double as sound mutes.
  hiddenTransportGroups() {
    return TRANSPORT_GROUPS.filter((group) => !this.layers[group]);
  }

  update(currentTimeSeconds) {
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
    if (this.#trailShown(context.camera)) {
      this.#drawVehicleTrails(
        p,
        context,
        visible.filter((vehicle) => trailedLayer(vehicle.category)),
      );
    }
    this.#drawVehicleHeads(p, context, visible);
  }

  #trailShown(camera) {
    return trailShownOn(this.background, camera.zoomFraction());
  }

  #drawVehicleHeads(p, context, vehicles) {
    const worldPerPixel = context.camera.worldPerPixel();
    const headFactor = this.#trailShown(context.camera)
      ? trailHeadFactor(context.camera.zoomFraction())
      : 1;
    vehicles.forEach((vehicle) => {
      const [r, g, b] = categoryColor(vehicle.category);
      p.fill(r, g, b);
      const diameter =
        BASE_DIAMETER_PIXELS *
        diameterFactor(vehicle.category) *
        headFactor *
        worldPerPixel;
      p.circle(vehicle.east, vehicle.north, diameter);
    });
  }

  // Plain alpha, not additive light: additive clips channel by channel, so
  // overlapping particles saturate the strongest channel and drift to white.
  #drawVehicleTrails(p, context, vehicles) {
    const size = TRAIL_PARTICLE_PIXELS * context.camera.worldPerPixel();
    vehicles.forEach((vehicle) => {
      const [r, g, b] = categoryColor(vehicle.category);
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

  controlSections({ setInstrumentation, toggleInstrumentationEditor } = {}) {
    const sections = [
      {
        id: 'layers',
        title: 'Kategorien',
        element: this.#layerControl(),
        keepInExhibition: true,
      },
    ];
    if (this.capabilities.sonification) {
      sections.push({
        id: 'sound',
        title: 'Vertonung',
        element: this.#soundControl(
          setInstrumentation,
          toggleInstrumentationEditor,
        ),
        keepInExhibition: true,
      });
    }
    return sections;
  }

  keyBindings() {
    return {
      h: () => this.toggleStops(),
      n: () => this.toggleNetwork(),
    };
  }

  infoContent() {
    return buildInfoContent();
  }

  welcomeContent() {
    return buildWelcomeContent();
  }

  // The pixel maps draw the rail network themselves, so the overlay would
  // double it.
  onBackgroundChange(background) {
    this.background = background;
    if (background.showsRailwayLines) {
      this.layers.network = false;
    }
  }

  #soundControl(setInstrumentation, toggleInstrumentationEditor) {
    const group = element('div', 'control-options');
    this.soundChoices = new ChoiceList(
      [
        { value: SILENT_OPTION_VALUE, label: 'Kein Ton' },
        ...INSTRUMENTATIONS.map((instrumentation, index) => ({
          value: presetOptionValue(index),
          label: instrumentation.name,
        })),
      ],
      {
        chosen: SILENT_OPTION_VALUE,
        onChoose: () => setInstrumentation?.(this.#selectedInstrumentation()),
      },
    );
    group.appendChild(this.soundChoices.root);
    if (toggleInstrumentationEditor) {
      group.appendChild(this.#ownSoundButton(toggleInstrumentationEditor));
    }
    return group;
  }

  #ownSoundButton(toggleInstrumentationEditor) {
    const button = element('button', 'instrumentation-editor-open');
    button.type = 'button';
    button.setAttribute('aria-label', 'Selber vertonen');
    button.setAttribute('title', 'Selber vertonen');
    button.appendChild(pencilIcon());
    button.addEventListener('click', () =>
      toggleInstrumentationEditor(this.#templateDocument()),
    );
    return button;
  }

  #templateDocument() {
    return (this.#selectedInstrumentation() ?? INSTRUMENTATIONS[0]).document;
  }

  #selectedInstrumentation() {
    return instrumentationForOptionValue(
      this.soundChoices.chosen,
      this.customInstrumentation,
    );
  }

  offerCustomInstrumentation(instrumentation) {
    this.customInstrumentation = instrumentation;
    this.soundChoices.offer({
      value: CUSTOM_OPTION_VALUE,
      label: instrumentation.name,
    });
  }

  useCustomInstrumentation(instrumentation) {
    this.offerCustomInstrumentation(instrumentation);
    this.soundChoices.show(CUSTOM_OPTION_VALUE);
  }

  // Returns what plays afterwards: silence if the discarded one was chosen.
  forgetCustomInstrumentation() {
    if (this.soundChoices.chosen === CUSTOM_OPTION_VALUE) {
      this.soundChoices.show(SILENT_OPTION_VALUE);
    }
    this.customInstrumentation = null;
    this.soundChoices.withdraw(CUSTOM_OPTION_VALUE);
    return this.#selectedInstrumentation();
  }

  silenceTheSound() {
    this.soundChoices.show(SILENT_OPTION_VALUE);
    return this.#selectedInstrumentation();
  }

  drawStation() {
    return drawnStationThatTravels(
      this.catalog.entries.filter(
        (station) => dominantStationMode(station.modes) === 'rail',
      ),
      (station) => this.stationSoundEvents(station).length > 0,
    );
  }

  #categoryVisible(category) {
    return this.layers[layerOfCategory(category)];
  }

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

  // A searched station may serve a mode whose vehicle layer is off; that layer
  // has to come on before the stops layer for its node to draw.
  revealStation(station) {
    const layer = layerToRevealStation(station.modes, this.layers);
    if (layer) {
      this.#showLayer(layer);
    }
    this.#setStops(true);
  }

  #showLayer(layer) {
    layersDownTo(layer).forEach((key) => {
      this.layers[key] = true;
    });
  }

  #setStops(on) {
    this.layers.stops = on;
    if (on) {
      this.#ensureVisibleMode();
    }
  }

  // Stops with every vehicle layer off would draw nothing.
  #ensureVisibleMode() {
    const fallback = fallbackLayerForStops(this.layers);
    if (fallback) {
      this.#showLayer(fallback);
    }
  }

  // Layers also flip without their checkbox (background choice, zoom crossing,
  // search selection), so the checkboxes track the layer state.
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
    const [fillRed, fillGreen, fillBlue] = outlined
      ? STATION_NODE_FILL
      : STATION_NODE_FILL_ON_BLACK;
    p.fill(fillRed, fillGreen, fillBlue);
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
    const radius = stationPickRadiusPixels(this.camera.zoomFraction());
    const candidates = this.catalog.entries.filter(
      (station) => this.#stationShown(station) && accept(station),
    );
    return nearestStation(candidates, this.camera, screenX, screenY, radius);
  }

  // nearestStation reads the same east/north an active vehicle carries, so it
  // doubles as the vehicle picker.
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
      category: vehicle.category,
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

  toggleNetwork() {
    this.layers.network = !this.layers.network;
  }

  #layerControl() {
    const control = element('div', 'layer-choices');
    control.append(
      this.#layerGroup(TRAFFIC_LAYERS),
      this.#layerGroup(GROUND_LAYERS),
    );
    return control;
  }

  #layerGroup(layers) {
    const group = element('div', 'control-options');
    layers.forEach(([key, label, category]) => {
      group.appendChild(this.#layerOption(key, label, category));
    });
    return group;
  }

  #layerOption(key, label, category) {
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

    const option = element('label', 'control-option');
    const text = element('span');
    text.textContent = label;
    option.append(input, ...this.#swatchFor(category), text);
    return option;
  }

  #swatchFor(category) {
    if (category === undefined) {
      return [];
    }
    const [red, green, blue] = categoryColor(category);
    const swatch = element('span', 'control-swatch');
    swatch.style.setProperty('--swatch-color', `rgb(${red} ${green} ${blue})`);
    return [swatch];
  }
}
