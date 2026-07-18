// The client is origin-agnostic: it requests same-origin `/tiles/…` and the
// reverse proxy (nginx in prod, the Django dev server under DEBUG) adds the
// swisstopo host, referer and cache. The layer choice lives in the path.
const RELIEF_LAYER = 'ch.swisstopo.swissalti3d-reliefschattierung';

export const RELIEF_TILE_SOURCE = {
  layer: RELIEF_LAYER,
  extension: 'png',
  urlFor: (z, x, y) => `/tiles/${RELIEF_LAYER}/${z}/${x}/${y}.png`,
};
