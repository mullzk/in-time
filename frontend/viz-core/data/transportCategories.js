// What the blobs mean by a category: rail spans 0-4 (Fernverkehr, InterRegio,
// Regio, S-Bahn, other rail), then tram and bus. Every panel names and colours
// them from here.

export const CATEGORY_INTERCITY = 0;
export const CATEGORY_INTERREGIO = 1;
export const CATEGORY_REGIO = 2;
export const CATEGORY_TRAM = 5;
export const CATEGORY_BUS = 6;

const TEXT_ON_DARK_GROUND = [255, 255, 255];
const TEXT_ON_LIGHT_GROUND = [16, 18, 26];

const CATEGORY_COLORS = [
  [207, 10, 44],
  [226, 87, 30],
  [47, 150, 224],
  [82, 199, 226],
  [122, 135, 148],
  [138, 112, 206],
  [242, 183, 5],
];

// Text colour for each category used as a ground. Written out per category
// rather than computed from a lightness threshold: half of the palette sits in
// a narrow band around the middle, so any threshold cuts through it and several
// categories would flip on the smallest palette correction.
const CATEGORY_TEXT_COLORS = [
  TEXT_ON_DARK_GROUND,
  TEXT_ON_LIGHT_GROUND,
  TEXT_ON_LIGHT_GROUND,
  TEXT_ON_LIGHT_GROUND,
  TEXT_ON_LIGHT_GROUND,
  TEXT_ON_DARK_GROUND,
  TEXT_ON_LIGHT_GROUND,
];

const FALLBACK_COLOR = [200, 200, 200];

export const categoryColor = (category) =>
  CATEGORY_COLORS[category] ?? FALLBACK_COLOR;

export const categoryTextColor = (category) =>
  CATEGORY_TEXT_COLORS[category] ?? TEXT_ON_LIGHT_GROUND;

const CATEGORY_LABELS = [
  'Fernverkehr',
  'InterRegio',
  'Regio',
  'S-Bahn',
  'Bahn',
  'Tram',
  'Bus',
];

export const categoryLabel = (category) => CATEGORY_LABELS[category] ?? 'Fahrt';

// Rail splits into Fernverkehr (category 0), InterRegio (1) and
// Regionalverkehr (2-4); these are the display groups the sounds use too.
const LAYER_BY_CATEGORY = new Map([
  [CATEGORY_INTERCITY, 'fernverkehr'],
  [CATEGORY_INTERREGIO, 'interregio'],
  [CATEGORY_REGIO, 'regionalverkehr'],
  [3, 'regionalverkehr'],
  [4, 'regionalverkehr'],
  [CATEGORY_TRAM, 'tram'],
  [CATEGORY_BUS, 'bus'],
]);

export const layerOfCategory = (category) =>
  LAYER_BY_CATEGORY.get(category) ?? 'regionalverkehr';

// Sorts so that the highest-ranking category is drawn last.
export const byRisingRank = (first, second) => second.category - first.category;
