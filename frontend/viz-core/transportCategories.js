// What the blobs mean by a category, in one place: rail spans 0-4 (Fernverkehr,
// InterRegio, Regio, S-Bahn, other rail), then tram and bus. Every panel names
// and colours them the same way, so a bus is yellow wherever it is drawn.

export const CATEGORY_INTERCITY = 0;
export const CATEGORY_INTERREGIO = 1;
export const CATEGORY_TRAM = 5;
export const CATEGORY_BUS = 6;

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

export const categoryColor = (category) =>
  CATEGORY_COLORS[category] ?? FALLBACK_COLOR;

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
  [2, 'regionalverkehr'],
  [3, 'regionalverkehr'],
  [4, 'regionalverkehr'],
  [CATEGORY_TRAM, 'tram'],
  [CATEGORY_BUS, 'bus'],
]);

export const layerOfCategory = (category) =>
  LAYER_BY_CATEGORY.get(category) ?? 'regionalverkehr';

export const VEHICLE_LAYER_LABELS = [
  ['fernverkehr', 'Fernverkehr'],
  ['interregio', 'InterRegio'],
  ['regionalverkehr', 'Regionalverkehr'],
  ['tram', 'Tram'],
  ['bus', 'Bus'],
];
