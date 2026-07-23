// The client is origin-agnostic: it requests same-origin `/tiles/…` and the
// reverse proxy (nginx in prod, the Django dev server under DEBUG) adds the
// swisstopo host, referer and cache. The layer choice lives in the path.
const tileSource = (layer, extension) => ({
  layer,
  extension,
  urlFor: (z, x, y) => `/tiles/${layer}/${z}/${x}/${y}.${extension}`,
});

export const RELIEF_TILE_SOURCE = tileSource(
  'ch.swisstopo.swissalti3d-reliefschattierung',
  'png',
);
export const PIXELKARTE_COLOR_TILE_SOURCE = tileSource(
  'ch.swisstopo.pixelkarte-farbe',
  'jpeg',
);
export const PIXELKARTE_GREY_TILE_SOURCE = tileSource(
  'ch.swisstopo.pixelkarte-grau',
  'jpeg',
);

// A null source means no raster: the dark canvas clear shows through as the
// black background. The first entry is the default the panel opens with.
export const BACKGROUNDS = [
  { id: 'relief', label: 'Relief', source: RELIEF_TILE_SOURCE },
  {
    id: 'pixel-color',
    label: 'Pixelkarte farbig',
    source: PIXELKARTE_COLOR_TILE_SOURCE,
  },
  {
    id: 'pixel-grey',
    label: 'Pixelkarte grau',
    source: PIXELKARTE_GREY_TILE_SOURCE,
  },
  { id: 'black', label: 'Schwarz', source: null },
];
