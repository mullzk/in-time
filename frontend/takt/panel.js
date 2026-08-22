import { readStationPoints } from '../viz-core/blobStations.js';
import { ChoiceList } from '../viz-core/choiceList.js';
import { pencilIcon } from '../viz-core/dockIcons.js';
import { element } from '../viz-core/dom.js';
import { Panel } from '../viz-core/panel.js';
import { INSTRUMENTATIONS } from '../viz-core/sonification/presets.js';
import { TRANSPORT_GROUPS } from '../viz-core/sonification/scheduling.js';
import { SonificationEngine } from '../viz-core/sonification/sonificationEngine.js';
import { drawnStationThatTravels } from '../viz-core/startStation.js';
import { StationCatalog } from '../viz-core/stationCatalog.js';
import {
  dominantStationMode,
  fallbackLayerForStops,
  layersDownTo,
  layerToRevealStation,
  nearestStation,
  nodeDiameterPixels,
  STATION_HIT_RADIUS_PIXELS,
  stationIsShown,
  stationPickRadiusPixels,
  stopsToggleOnZoomCross,
} from '../viz-core/stationNodes.js';
import { BACKGROUNDS } from '../viz-core/tiles/tileSource.js';
import {
  CATEGORY_BUS,
  CATEGORY_INTERCITY,
  CATEGORY_INTERREGIO,
  CATEGORY_REGIO,
  CATEGORY_TRAM,
  categoryColor,
  categoryLabel,
  layerOfCategory,
} from '../viz-core/transportCategories.js';
import { VehiclePositionEngine } from '../viz-core/vehiclePositionEngine.js';
import { buildInfoContent } from './infoContent.js';

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
  [CATEGORY_TRAM, 1],
  [CATEGORY_BUS, 1],
]);
const diameterFactor = (category) =>
  DIAMETER_FACTOR_BY_CATEGORY.get(category) ?? 1.5;

// Whether a vehicle trails the stretch of schedule it has just covered follows
// from the ground it draws on, so it needs no switch of its own: the busier the
// texture underneath, the more the smear reads as mud rather than as movement.
// So every ground names the zoom fraction it trails up to: empty ground all the
// way, the textured ones as long as their own texture stays coarser than the
// trail particles -- the aerial imagery far into the zoom, the relief only over
// the overview, where its hillshade is still a broad wash -- and the drawn maps
// not at all. The switch is abrupt on purpose: a half-faded trail behind a full
// head reads as a tadpole, so a trail is either fully there with a small head or
// gone with a full one.
const TRAIL_UNTIL_ZOOM_FRACTION_BY_BACKGROUND = new Map([
  ['black', Number.POSITIVE_INFINITY],
  ['swissview', 0.75],
  ['relief', 0.42],
  ['pixel-color', 0],
  ['pixel-grey', 0],
]);
export const trailShownOn = (background, zoomFraction) =>
  zoomFraction < TRAIL_UNTIL_ZOOM_FRACTION_BY_BACKGROUND.get(background.id);

// The trail samples the vehicle's own trip backwards in schedule time, so its
// length on screen is the distance actually covered: a fast train smears long,
// a stopping one contracts to its head.
const TRAIL_PARTICLE_PIXELS = 3.4;
const TRAIL_HEAD_ALPHA = 230;
const TRAIL_TAIL_ALPHA = 12;

// How far back a service reaches beyond the plain schedule distance: the trail
// length is the second thing after colour that tells the services apart. Only
// trains trail -- tram and bus run too dense and too short for a smear to read
// as movement.
const TRAIL_BASE_LENGTH_SECONDS = 84;
const TRAIL_LENGTH_FACTOR_BY_LAYER = new Map([
  ['fernverkehr', 1.25],
  ['interregio', 1],
  ['regionalverkehr', 2 / 3],
]);
const trailedLayer = (category) =>
  TRAIL_LENGTH_FACTOR_BY_LAYER.has(layerOfCategory(category));

// The gap between samples, in schedule seconds. Long-distance trains both reach
// furthest and move fastest, so at close zoom the same gap tears their trail
// into separate dots; they get the tightest one, the InterRegio a middling one.
// The slower, shorter services read as a smear at the wide gap and would only
// cost samples at a tighter one.
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
// Behind a trail the head only has to mark where the vehicle is, so it shrinks
// -- and further still in the far view, where full-size heads would close into a
// carpet of dots and swallow the trails they belong to. Tram and bus draw no
// trail but shrink with the rest, so a background showing trails keeps one head
// size and the untrailed vehicles do not tower over the trailed ones. Where no
// trail is drawn the head carries the vehicle alone and keeps its full size.
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
// On the black ground the nodes carry no outline, so a white fill puts them at
// the same weight as the vehicles and the net reads as dots rather than as the
// stage the traffic moves on. A dark grey holds the places without competing.
const STATION_NODE_FILL_ON_BLACK = [64, 64, 64];
// Over a raster background a white node needs an outline; its colour marks the
// station's mode, using the same hues the tram and bus vehicles carry (rail
// keeps a plain black outline). On the black background nodes read on their own.
const STATION_STROKE_BY_MODE = new Map([
  ['rail', [0, 0, 0]],
  ['tram', categoryColor(CATEGORY_TRAM)],
  ['bus', categoryColor(CATEGORY_BUS)],
]);
const STATION_STROKE_WIDTH_PIXELS = 1;
// Vehicles are smaller and denser than station nodes, so keep their tap target
// tighter to avoid grabbing a neighbour.
const VEHICLE_HIT_RADIUS_PIXELS = 10;

// Zoom fraction at and above which the stops layer switches itself on; below it,
// switches off. A manual toggle persists until the next crossing.
const STOPS_ZOOM_THRESHOLD = 0.5;

// The traffic first, each layer under the colour it is drawn in, and the ground
// it moves over after it -- the two are read as different kinds of thing, so the
// card keeps them apart.
const TRAFFIC_LAYERS = [
  ['fernverkehr', 'Fernverkehr', CATEGORY_INTERCITY],
  ['interregio', 'InterRegio', CATEGORY_INTERREGIO],
  ['regionalverkehr', 'Regionalverkehr', CATEGORY_REGIO],
  ['tram', 'Tram', CATEGORY_TRAM],
  ['bus', 'Bus', CATEGORY_BUS],
];

const GROUND_LAYERS = [
  ['network', 'Netz'],
  ['stops', 'Haltestellen'],
];

const didokToIndex = (stations) =>
  new Map(stations.map((station, index) => [station.didok, index]));

// The sound list is keyed by option value, not by name: an own instrumentation may
// carry the name of a delivered one, and then only the value tells them apart.
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
    timeSeeking: true,
    stationSearch: true,
    stationPicking: true,
    mapBackground: true,
    zoomSlider: true,
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
      tram: false,
      bus: false,
    };
    this.currentTimeSeconds = 0;
    this.customInstrumentation = null;
    this.customOption = null;
    this.background = BACKGROUNDS[0];
    this.previousZoomFraction = null;
    this.layerOptions = {};
    this.camera = null;
    this.adoptSchedule(railBuffer, railStations);
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

  // Plain alpha, not additive light: additive clips channel by channel, so where
  // a trail's own particles overlap -- densest in the far view, where its whole
  // length falls on a few pixels -- the strongest channel saturates first and the
  // colour drifts to white. Blended, the overlap converges on the vehicle's own
  // colour instead.
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
        title: 'Ebenen',
        element: this.#layerControl(),
        keepInExhibition: true,
      },
    ];
    if (this.capabilities.sonification) {
      sections.push({
        id: 'sound',
        title: 'Sound',
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

  // The instrumentations stand open, "Kein Sound" among them as silence. An own
  // instrumentation joins the list only once one has been written, and the way
  // to write one sits under it -- it is a further way to choose a sound, not a
  // topic of its own. Without a way to reach the drawer the button stays away,
  // which is how the exhibition does without it. The sonified station, tempo and
  // per-group mutes come from the existing controls.
  #soundControl(setInstrumentation, toggleInstrumentationEditor) {
    const group = element('div', 'control-options');
    this.soundChoices = new ChoiceList(
      [
        { value: SILENT_OPTION_VALUE, label: 'Kein Sound' },
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

  // The pencil says it: the way to write an instrumentation of one's own stands
  // beside the choice of a delivered one, not under a sentence of its own.
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

  // What a new own instrumentation starts from: what is being listened to right
  // now, or the first delivered one while nothing sounds.
  #templateDocument() {
    return (this.#selectedInstrumentation() ?? INSTRUMENTATIONS[0]).document;
  }

  #selectedInstrumentation() {
    return instrumentationForOptionValue(
      this.soundChoices.chosen,
      this.customInstrumentation,
    );
  }

  // The editor announces every version that plays; the list carries it under its
  // current name, so renaming it in the document renames it here.
  offerCustomInstrumentation(instrumentation) {
    this.customInstrumentation = instrumentation;
    this.soundChoices.offer({
      value: CUSTOM_OPTION_VALUE,
      label: instrumentation.name,
    });
  }

  // While the drawer is open, its document is what is being listened to --
  // otherwise writing it would say nothing about how it sounds.
  useCustomInstrumentation(instrumentation) {
    this.offerCustomInstrumentation(instrumentation);
    this.soundChoices.show(CUSTOM_OPTION_VALUE);
  }

  // The discarded document leaves the list with it. Whoever was listening to it
  // falls back to silence, while a listener who had meanwhile picked a delivered
  // instrumentation keeps hearing it -- hence the answer of what plays now rather
  // than a fixed one.
  forgetCustomInstrumentation() {
    if (this.soundChoices.chosen === CUSTOM_OPTION_VALUE) {
      this.soundChoices.show(SILENT_OPTION_VALUE);
    }
    this.customInstrumentation = null;
    this.soundChoices.withdraw(CUSTOM_OPTION_VALUE);
    return this.#selectedInstrumentation();
  }

  // A stop nothing calls at would stay as silent as no stop at all, so the drawn
  // one has to have something to sound. Only railway stations are drawn: a
  // station voices its whole interchange, so a drawn one carries the tram and bus
  // stops around it as well, where a bus stop drawn out of the country sounds a
  // few times an hour. Searching for one by name reaches every stop as before.
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

  // Stops with every vehicle layer off would draw nothing, so switching them on
  // pulls the trains in too.
  #ensureVisibleMode() {
    const fallback = fallbackLayerForStops(this.layers);
    if (fallback) {
      this.#showLayer(fallback);
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
    const radius = stationPickRadiusPixels(this.camera.zoomFraction());
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

  // Only the colour comes from here; what the dot made of it looks like is the
  // stylesheet's. A layer that is not a kind of traffic carries none.
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
