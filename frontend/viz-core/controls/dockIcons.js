import {
  CATEGORY_BUS,
  CATEGORY_INTERCITY,
  CATEGORY_INTERREGIO,
  CATEGORY_REGIO,
  CATEGORY_TRAM,
  categoryColor,
} from '../data/transportCategories.js';

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
const ICON_SIZE = 24;

const svgElement = (tag, attributes) => {
  const node = document.createElementNS(SVG_NAMESPACE, tag);
  Object.entries(attributes).forEach(([name, value]) => {
    node.setAttribute(name, String(value));
  });
  return node;
};

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

// A stack of views, the one on top in full and the two behind it showing the
// corner they stick out by: what the card offers is one of several pictures of
// the same thing.
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

// The layers this tile switches, each as its own colour: what the dots stand for
// is what one is about to turn on and off.
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

// A coarse ring of the Swiss border in LV95, the same coordinates the app draws
// in, fitted into the icon box -- so the silhouette stays right if it is ever
// refined from real geometry.
const BORDER_LV95_KILOMETRES = [
  // The Jura, north-east from the western tip at Geneva to the Ajoie salient
  // and the corner at Basel.
  [2500, 1118],
  [2494, 1133],
  [2519, 1174],
  [2529, 1197],
  [2544, 1212],
  [2580, 1240],
  [2565, 1259],
  [2588, 1258],
  [2611, 1270],
  // The Rhine, east along the northern edge over the bulge at Schaffhausen to
  // the Bodensee.
  [2640, 1267],
  [2676, 1272],
  [2687, 1290],
  [2712, 1281],
  [2728, 1279],
  [2748, 1268],
  [2764, 1252],
  // The Rhine valley and Graubünden, south-east to the eastern tip at Müstair
  // and the spur below Poschiavo.
  [2757, 1230],
  [2758, 1213],
  [2772, 1201],
  [2800, 1195],
  [2818, 1183],
  [2833, 1169],
  [2818, 1150],
  [2807, 1123],
  [2785, 1131],
  // Ticino: the wedge running far south to Chiasso, and the notch Italy pushes
  // north into above Domodossola -- the two marks that tell the southern edge
  // apart from a plain line.
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
  // The Valais, west along the Alpine crest to the southern tip at the Great St
  // Bernard, then back along the middle of Lake Geneva.
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

const outlinePath = (ring, padding = 1.5) => {
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

// Filled rather than drawn: at the size a tile leaves it, a stroked border
// closes its own notches and the country turns into a blob. The silhouette keeps
// the marks that name it -- the wedge down to Chiasso, the tip at Geneva.
const mapIcon = () =>
  icon(
    svgElement('path', {
      d: outlinePath(BORDER_LV95_KILOMETRES),
      fill: 'currentColor',
      stroke: 'none',
    }),
  );

const soundIcon = () =>
  icon(
    svgElement('path', { d: 'M17 4.5v9.6' }),
    svgElement('path', { d: 'M17 4.5 9 6.4v9.7' }),
    svgElement('circle', { cx: 6.4, cy: 16.6, r: 2.6 }),
    svgElement('circle', { cx: 14.4, cy: 14.6, r: 2.6 }),
  );

// The two faces of the play tile: what pressing it will do next.
const playIcon = () =>
  icon(
    svgElement('path', {
      d: 'M8.5 5.6 18 12l-9.5 6.4V5.6Z',
      fill: 'currentColor',
      'stroke-linejoin': 'round',
    }),
  );

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
