import { element } from '../viz-core/dom.js';
import { Panel } from '../viz-core/panel.js';
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

// Rail spans categories 0-4 and is the default; only tram and bus carry a
// dedicated layer, so the rail categories are absent from this map.
const LAYER_BY_CATEGORY = new Map([
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

const LAYER_LABELS = [
  ['network', 'Netz'],
  ['rail', 'Bahn'],
  ['tram', 'Tram'],
  ['bus', 'Bus'],
];

export class HerzschlagPanel extends Panel {
  capabilities = { transport: true, fullDayScrubber: true };

  constructor(railBuffer, roadBuffer) {
    super();
    this.railBuffer = railBuffer;
    this.roadBuffer = roadBuffer;
    this.activeVehicles = [];
    this.layers = { network: true, rail: true, tram: false, bus: false };
    this.backgroundShowsRailwayLines = false;
    this.zoomSlider = null;
    this.zoomScrubbing = false;
    this.networkOption = null;
    this.camera = null;
  }

  init(context) {
    this.camera = context.camera;
    this.engines = [
      new VehiclePositionEngine(this.railBuffer),
      new VehiclePositionEngine(this.roadBuffer),
    ];
  }

  update(currentTimeSeconds, _deltaSeconds) {
    this.activeVehicles = this.engines
      .flatMap((engine) => engine.activeAt(currentTimeSeconds))
      .sort(
        (first, second) =>
          drawPriority(first.category) - drawPriority(second.category),
      );
    this.#syncZoomSlider();
    this.#syncNetworkOption();
  }

  drawWorld(p, context) {
    context.drawTiles(p);
    if (this.layers.network && this.#networkVisible()) {
      this.engines.forEach((engine) => {
        context.drawBasemap(p, engine.edges);
      });
    }

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

  buildSidebarSections(context) {
    return [
      { title: 'Hintergrund', element: this.#backgroundControl(context) },
      { title: 'Ebenen', element: this.#layerControl() },
      { title: 'Zoom', element: this.#zoomControl(context) },
    ];
  }

  #categoryVisible(category) {
    return this.layers[LAYER_BY_CATEGORY.get(category) ?? 'rail'];
  }

  // The pixel maps draw the rail network themselves once zoomed in, so the
  // overlay would only double it; keep it there only on the label-free overview.
  #networkVisible() {
    return (
      !this.backgroundShowsRailwayLines ||
      (this.camera?.fullyZoomedOut() ?? false)
    );
  }

  // Grey out the network switch while the zoom/background force the overlay off,
  // so the checkbox never claims to control something that has no effect.
  #syncNetworkOption() {
    if (this.networkOption) {
      this.networkOption.disabled = !this.#networkVisible();
    }
  }

  #backgroundControl(context) {
    const group = element('div', 'sidebar-options');
    BACKGROUNDS.forEach((background, index) => {
      const input = element('input');
      input.type = 'radio';
      input.name = 'background';
      input.checked = index === 0;
      input.addEventListener('change', () => {
        context.setBackground(background.source);
        this.backgroundShowsRailwayLines =
          background.showsRailwayLines ?? false;
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
        this.layers[key] = input.checked;
      });
      if (key === 'network') {
        this.networkOption = input;
      }
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
