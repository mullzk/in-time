/**
 * The key to the hub layers, innermost first, drawn from the same classes and
 * opacities as the canvas.
 */
import { element } from '../viz-core/controls/dom.js';
import { HUB_COLOR, HUB_LAYER_OPACITY } from './hubLayers.js';
import { svgElement } from './svg.js';
import { TRAIN_CLASSES } from './trainClasses.js';

const SWATCH_RADIUS = 7;
const SWATCH_RING_WIDTH = 4;
const HUB_FILL = `rgb(${HUB_COLOR.join(' ')})`;

const coreSwatch = (opacity) =>
  svgElement('circle', {
    r: SWATCH_RADIUS,
    fill: HUB_FILL,
    'fill-opacity': opacity,
  });

const ringSwatch = (opacity) =>
  svgElement('circle', {
    r: SWATCH_RADIUS - SWATCH_RING_WIDTH / 2,
    fill: 'none',
    stroke: HUB_FILL,
    'stroke-opacity': opacity,
    'stroke-width': SWATCH_RING_WIDTH,
  });

export class HubLegend {
  constructor(container) {
    this.root = element('aside', 'hub-legend');
    const heading = element('p', 'hub-legend-heading');
    heading.textContent = 'Knotenpunkte: Züge zwischen Ankunft und Abfahrt';
    const list = element('ul', 'hub-legend-segments');
    list.append(
      ...TRAIN_CLASSES.map((trainClass, layerIndex) =>
        this.#segment(trainClass, layerIndex),
      ),
    );
    this.root.append(heading, list);
    container.appendChild(this.root);
  }

  #segment({ id, label }, layerIndex) {
    const icon = svgElement('svg', {
      class: 'hub-legend-swatch',
      viewBox: `${-SWATCH_RADIUS} ${-SWATCH_RADIUS} ${2 * SWATCH_RADIUS} ${2 * SWATCH_RADIUS}`,
      'aria-hidden': 'true',
    });
    const swatch = layerIndex === 0 ? coreSwatch : ringSwatch;
    icon.appendChild(swatch(HUB_LAYER_OPACITY[id]));
    const text = element('span');
    text.textContent = label;
    const item = element('li', 'hub-legend-segment');
    item.append(icon, text);
    return item;
  }
}
