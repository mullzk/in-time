// What the blobs mean by a category, in one place: rail spans 0-4 (Fernverkehr,
// InterRegio, Regio, S-Bahn, other rail), then tram and bus. Every panel names
// and colours them the same way, so a bus is yellow wherever it is drawn.

export const CATEGORY_INTERCITY = 0;
export const CATEGORY_INTERREGIO = 1;
export const CATEGORY_REGIO = 2;
export const CATEGORY_TRAM = 5;
export const CATEGORY_BUS = 6;

const CATEGORY_COLORS = [
  [207, 10, 44],
  [226, 87, 30],
  [47, 150, 224],
  [82, 199, 226],
  [122, 135, 148],
  [47, 158, 110],
  [242, 183, 5],
];
const FALLBACK_COLOR = [200, 200, 200];

export const categoryColor = (category) =>
  CATEGORY_COLORS[category] ?? FALLBACK_COLOR;

const TEXT_ON_DARK_GROUND = [255, 255, 255];
const TEXT_ON_LIGHT_GROUND = [16, 18, 26];

// What reads on each colour where it is used as a ground rather than as a dot.
// Written out per category rather than computed from a lightness threshold: the
// palette is near iso-lightness -- five of the seven lie within a thirtieth of
// each other -- so any threshold cuts through the middle of it, and four
// categories would flip on the smallest palette correction.
const CATEGORY_TEXT_COLORS = [
  TEXT_ON_DARK_GROUND,
  TEXT_ON_LIGHT_GROUND,
  TEXT_ON_LIGHT_GROUND,
  TEXT_ON_LIGHT_GROUND,
  TEXT_ON_LIGHT_GROUND,
  TEXT_ON_LIGHT_GROUND,
  TEXT_ON_LIGHT_GROUND,
];

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

// Rail splits into a long-distance, an InterRegio and a regional layer, matching
// the display groups the sounds use as well: Fernverkehr (category 0),
// InterRegio (1) and Regionalverkehr (2-4), plus the tram and bus layers.
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

// Drawn from the least structural traffic to the most, so a long-distance train
// is never hidden under the buses around it.
export const byRisingRank = (first, second) => second.category - first.category;
