/**
 * The three classes of train the Puls view tells apart, in the order of the hub
 * layers from the core outwards. Every other category goes unshown.
 */
import {
  CATEGORY_INTERCITY,
  CATEGORY_INTERREGIO,
  CATEGORY_REGIO,
} from '../viz-core/data/transportCategories.js';

const CATEGORY_SBAHN = 3;
const REGIONAL_GREY = [120, 120, 120];
const LARGE_DISC_PIXELS = 7;
const SMALL_DISC_PIXELS = 3;

export const LONG_DISTANCE = 'longDistance';
export const INTERREGIO = 'interregio';
export const REGIONAL = 'regional';

export const TRAIN_CLASSES = [
  {
    id: LONG_DISTANCE,
    label: 'InterCity',
    categories: [CATEGORY_INTERCITY],
    discColor: [0, 0, 0],
    discDiameterPixels: LARGE_DISC_PIXELS,
  },
  {
    id: INTERREGIO,
    label: 'InterRegio',
    categories: [CATEGORY_INTERREGIO],
    discColor: REGIONAL_GREY,
    discDiameterPixels: LARGE_DISC_PIXELS,
  },
  {
    id: REGIONAL,
    label: 'Regio / S-Bahn',
    categories: [CATEGORY_REGIO, CATEGORY_SBAHN],
    discColor: REGIONAL_GREY,
    discDiameterPixels: SMALL_DISC_PIXELS,
  },
];

export const trainClassById = (id) =>
  TRAIN_CLASSES.find((trainClass) => trainClass.id === id);

export const trainClassOf = (category) =>
  TRAIN_CLASSES.find(({ categories }) => categories.includes(category))?.id ??
  null;

export const drawRank = (id) =>
  TRAIN_CLASSES.length -
  1 -
  TRAIN_CLASSES.findIndex((trainClass) => trainClass.id === id);
