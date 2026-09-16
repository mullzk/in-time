/**
 * The key to the hub layers, innermost first, drawn from the same classes and
 * opacities as the canvas.
 */
import { element } from '../viz-core/controls/dom.js';
import {
  HUB_LAYER_OPACITY,
  HUB_NEUTRAL_COLOR,
  HUB_STEADY_COLOR,
} from './hubLayers.js';
import { svgElement } from './svg.js';
import { TRAIN_CLASSES } from './trainClasses.js';

const SWATCH_RADIUS = 7;
const SWATCH_RING_WIDTH = 4;
const PHASE_HINT = "Drücke 'c' um Ankunft und Abfahrt zu unterscheiden";

const cssColor = (color) => `rgb(${color.join(' ')})`;

const coreSwatch = (opacity) => ({
  shape: svgElement('circle', {
    r: SWATCH_RADIUS,
    'fill-opacity': opacity,
  }),
  colorAttribute: 'fill',
});

const ringSwatch = (opacity) => ({
  shape: svgElement('circle', {
    r: SWATCH_RADIUS - SWATCH_RING_WIDTH / 2,
    fill: 'none',
    'stroke-opacity': opacity,
    'stroke-width': SWATCH_RING_WIDTH,
  }),
  colorAttribute: 'stroke',
});

export class HubLegend {
  constructor(container) {
    this.root = element('aside', 'hub-legend');
    this.swatches = [];
    const heading = element('p', 'hub-legend-heading');
    heading.textContent = 'Knotenpunkte: Züge zwischen Ankunft und Abfahrt';
    const list = element('ul', 'hub-legend-segments');
    list.append(
      ...TRAIN_CLASSES.map((trainClass, layerIndex) =>
        this.#segment(trainClass, layerIndex),
      ),
    );
    const hint = element('p', 'hub-legend-hint');
    hint.textContent = PHASE_HINT;
    this.root.append(heading, list, hint);
    container.appendChild(this.root);
    this.showPhaseColors(false);
  }

  showPhaseColors(inUse) {
    const color = cssColor(inUse ? HUB_NEUTRAL_COLOR : HUB_STEADY_COLOR);
    this.swatches.forEach(({ shape, colorAttribute }) => {
      shape.setAttribute(colorAttribute, color);
    });
  }

  #segment({ id, label }, layerIndex) {
    const icon = svgElement('svg', {
      class: 'hub-legend-swatch',
      viewBox: `${-SWATCH_RADIUS} ${-SWATCH_RADIUS} ${2 * SWATCH_RADIUS} ${2 * SWATCH_RADIUS}`,
      'aria-hidden': 'true',
    });
    const swatch = (layerIndex === 0 ? coreSwatch : ringSwatch)(
      HUB_LAYER_OPACITY[id],
    );
    this.swatches.push(swatch);
    icon.appendChild(swatch.shape);
    const text = element('span');
    text.textContent = label;
    const item = element('li', 'hub-legend-segment');
    item.append(icon, text);
    return item;
  }
}
