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
  }

  init() {
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
  }

  drawWorld(p, context) {
    context.drawTiles(p);
    if (this.layers.network) {
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
    ];
  }

  #categoryVisible(category) {
    return this.layers[LAYER_BY_CATEGORY.get(category) ?? 'rail'];
  }

  #backgroundControl(context) {
    const group = element('div', 'sidebar-options');
    BACKGROUNDS.forEach((background, index) => {
      const input = element('input');
      input.type = 'radio';
      input.name = 'background';
      input.checked = index === 0;
      input.addEventListener('change', () =>
        context.setBackground(background.source),
      );
      group.appendChild(this.#option(input, background.label));
    });
    return group;
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
