import {
  CATEGORY_BUS,
  CATEGORY_INTERCITY,
  CATEGORY_INTERREGIO,
  CATEGORY_REGIO,
  CATEGORY_TRAM,
  categoryColor,
} from '../data/transportCategories.js';
import { svgElement } from './svg.js';

const ICON_SIZE = 24;

const icon = (...children) => {
  const svg = svgElement('svg', {
    viewBox: `0 0 ${ICON_SIZE} ${ICON_SIZE}`,
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': 1.6,
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
    'aria-hidden': 'true',
  });
  svg.append(...children);
  return svg;
};

const viewsIcon = () =>
  icon(
    svgElement('path', { d: 'M11 3h7.5a2.5 2.5 0 0 1 2.5 2.5V11' }),
    svgElement('path', { d: 'M8.5 5.5H16a2.5 2.5 0 0 1 2.5 2.5v5.5' }),
    svgElement('rect', {
      x: 3.5,
      y: 8,
      width: 12.5,
      height: 12.5,
      rx: 2.5,
    }),
  );

const timeIcon = () =>
  icon(
    svgElement('circle', { cx: 12, cy: 12, r: 8.5 }),
    svgElement('path', { d: 'M12 7v5.4l3.4 2' }),
  );

const LAYER_CATEGORIES = [
  CATEGORY_INTERCITY,
  CATEGORY_INTERREGIO,
  CATEGORY_REGIO,
  CATEGORY_TRAM,
  CATEGORY_BUS,
];
const DOT_PLACES = [
  [7.5, 8.5],
  [12, 6.5],
  [16.5, 8.5],
  [9.5, 15.5],
  [14.5, 15.5],
];

const elementsIcon = () =>
  icon(
    ...LAYER_CATEGORIES.map((category, index) => {
      const [red, green, blue] = categoryColor(category);
      const [cx, cy] = DOT_PLACES[index];
      return svgElement('circle', {
        cx,
        cy,
        r: 2.4,
        fill: `rgb(${red} ${green} ${blue})`,
        stroke: 'none',
      });
    }),
  );

// A coarse ring of the Swiss border in LV95 kilometres, the coordinates the app
// draws in, fitted into the icon box.
const BORDER_LV95_KILOMETRES = [
  // The Jura, from the western tip at Geneva to the corner at Basel.
  [2500, 1118],
  [2494, 1133],
  [2519, 1174],
  [2529, 1197],
  [2544, 1212],
  [2580, 1240],
  [2565, 1259],
  [2588, 1258],
  [2611, 1270],
  // The Rhine, east over Schaffhausen to the Bodensee.
  [2640, 1267],
  [2676, 1272],
  [2687, 1290],
  [2712, 1281],
  [2728, 1279],
  [2748, 1268],
  [2764, 1252],
  // The Rhine valley and Graubünden, to the eastern tip at Müstair.
  [2757, 1230],
  [2758, 1213],
  [2772, 1201],
  [2800, 1195],
  [2818, 1183],
  [2833, 1169],
  [2818, 1150],
  [2807, 1123],
  [2785, 1131],
  // Ticino, down to Chiasso and back over Domodossola.
  [2761, 1136],
  [2745, 1118],
  [2740, 1103],
  [2717, 1096],
  [2722, 1077],
  [2710, 1092],
  [2698, 1108],
  [2683, 1122],
  [2673, 1146],
  [2657, 1125],
  // The Valais, west to the Great St Bernard and back along Lake Geneva.
  [2640, 1100],
  [2624, 1092],
  [2600, 1084],
  [2580, 1079],
  [2565, 1100],
  [2556, 1136],
  [2530, 1129],
];

const boundsOf = (ring) => ({
  eastMin: Math.min(...ring.map(([east]) => east)),
  eastMax: Math.max(...ring.map(([east]) => east)),
  northMin: Math.min(...ring.map(([, north]) => north)),
  northMax: Math.max(...ring.map(([, north]) => north)),
});

const outlinePath = (ring, padding) => {
  const { eastMin, eastMax, northMin, northMax } = boundsOf(ring);
  const box = ICON_SIZE - 2 * padding;
  const scale = Math.min(
    box / (eastMax - eastMin),
    box / (northMax - northMin),
  );
  const offsetX = padding + (box - (eastMax - eastMin) * scale) / 2;
  const offsetY = padding + (box - (northMax - northMin) * scale) / 2;
  return `${ring
    .map(([east, north], index) => {
      const x = offsetX + (east - eastMin) * scale;
      const y = offsetY + (northMax - north) * scale;
      return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(' ')} Z`;
};

const MAP_PADDING = 2;

const mapIcon = () =>
  icon(
    svgElement('path', {
      d: outlinePath(BORDER_LV95_KILOMETRES, MAP_PADDING),
    }),
  );

const soundIcon = () =>
  icon(
    svgElement('path', { d: 'M17 4.5v9.6' }),
    svgElement('path', { d: 'M17 4.5 9 6.4v9.7' }),
    svgElement('circle', { cx: 6.4, cy: 16.6, r: 2.6 }),
    svgElement('circle', { cx: 14.4, cy: 14.6, r: 2.6 }),
  );

const playIcon = () =>
  icon(svgElement('path', { d: 'M8.5 5.6 18 12l-9.5 6.4V5.6Z' }));

const pauseIcon = () =>
  icon(
    svgElement('path', { d: 'M9.2 5.5v13', 'stroke-width': 2.6 }),
    svgElement('path', { d: 'M14.8 5.5v13', 'stroke-width': 2.6 }),
  );

const infoIcon = () =>
  icon(
    svgElement('circle', { cx: 12, cy: 12, r: 8.5 }),
    svgElement('path', { d: 'M12 11v5.4' }),
    svgElement('circle', {
      cx: 12,
      cy: 7.8,
      r: 0.9,
      fill: 'currentColor',
      stroke: 'none',
    }),
  );

// The half hour as a clock face. At the node minute -- noon and six o'clock on
// the dial, where the trains change over from arriving to departing -- the
// colour stands full from the centre out to the rim, and over the quarter that
// follows it fades away to nothing, which is where the phases meet in the
// neutral colour. Four quarters, so the dial is covered.
const PHASE_RADIUS = 9.5;
// A sector of a circle cannot be faded with a gradient, which runs along a line
// rather than around a centre, so the sweep is stepped instead.
const PHASE_STEPS = 16;

const DEPARTING = 'departing';
const ARRIVING = 'arriving';

// In degrees of the dial, so the full and the half hour stand at the top and
// the bottom and the quarters at the sides: departure sweeps away from the node
// minute, arrival into it.
const PHASE_SPANS = [
  { solidAtDegrees: 0, towardsDegrees: 90, phase: DEPARTING },
  { solidAtDegrees: 180, towardsDegrees: 90, phase: ARRIVING },
  { solidAtDegrees: 180, towardsDegrees: 270, phase: DEPARTING },
  { solidAtDegrees: 360, towardsDegrees: 270, phase: ARRIVING },
];

const CENTRE = ICON_SIZE / 2;
const DEGREES_TO_RADIANS = Math.PI / 180;
const DIAL_NOON_OFFSET_DEGREES = -90;

const onTheDial = (degrees) => {
  const radians = (degrees + DIAL_NOON_OFFSET_DEGREES) * DEGREES_TO_RADIANS;
  return [
    CENTRE + PHASE_RADIUS * Math.cos(radians),
    CENTRE + PHASE_RADIUS * Math.sin(radians),
  ];
};

const phaseSector = (fromDegrees, toDegrees, color, opacity) => {
  const [startX, startY] = onTheDial(Math.min(fromDegrees, toDegrees));
  const [endX, endY] = onTheDial(Math.max(fromDegrees, toDegrees));
  return svgElement('path', {
    d:
      `M${CENTRE} ${CENTRE} L${startX.toFixed(2)} ${startY.toFixed(2)} ` +
      `A${PHASE_RADIUS} ${PHASE_RADIUS} 0 0 1 ` +
      `${endX.toFixed(2)} ${endY.toFixed(2)} Z`,
    fill: `rgb(${color.join(' ')})`,
    'fill-opacity': opacity.toFixed(3),
    stroke: 'none',
  });
};

// The steps are laid one inside the next rather than side by side: shapes that
// merely abut leave a seam of bare ground between them, nested ones cannot.
// Every layer reaches from the node minute a step less far and adds just the
// share that lifts the one under it onto the next rung of an even ramp, so the
// innermost wedge comes to stand in full colour.
const phaseSteps = ({ solidAtDegrees, towardsDegrees }, color) => {
  const stepDegrees = (towardsDegrees - solidAtDegrees) / PHASE_STEPS;
  return Array.from({ length: PHASE_STEPS }, (_, index) => {
    const stepsCovered = PHASE_STEPS - index;
    return phaseSector(
      solidAtDegrees,
      solidAtDegrees + stepsCovered * stepDegrees,
      color,
      1 / stepsCovered,
    );
  });
};

// Handed its colours rather than reading them, so the icon belongs to the dock
// while the phases belong to the view that colours them.
export const phasesIcon = (departureColor, arrivalColor) =>
  icon(
    ...PHASE_SPANS.flatMap((span) =>
      phaseSteps(
        span,
        span.phase === DEPARTING ? departureColor : arrivalColor,
      ),
    ),
  );

export const pencilIcon = () =>
  icon(
    svgElement('path', {
      d: 'M4 20h4L19.2 8.8a2.4 2.4 0 0 0-3.4-3.4L4.6 16.6 4 20Z',
    }),
    svgElement('path', { d: 'M14.8 6.6l2.6 2.6' }),
  );

const ICONS = {
  views: viewsIcon,
  play: playIcon,
  pause: pauseIcon,
  time: timeIcon,
  elements: elementsIcon,
  map: mapIcon,
  sound: soundIcon,
  info: infoIcon,
};

export const iconNamed = (name) => ICONS[name]();
