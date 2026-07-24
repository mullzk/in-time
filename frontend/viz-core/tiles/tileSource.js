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

// swisstopo's terms of use require a visible source credit wherever their maps
// are shown; every raster background carries it, the black one (no raster) none.
// The credit names the map layer, not the app, so it does not read as a
// copyright over the whole page — only the source name links out.
const SWISSTOPO_ATTRIBUTION = {
  prefix: 'Karten-Layer: ',
  label: 'swisstopo',
  href: 'https://www.swisstopo.admin.ch',
};

// A null source means no raster: the dark canvas clear shows through as the
// black background. The first entry is the default the panel opens with.
// `showsRailwayLines` marks rasters that already draw the rail network (and its
// labels) once zoomed in, so a panel can suppress its own network overlay there
// and keep it only on the label-free overview.
export const BACKGROUNDS = [
  {
    id: 'relief',
    label: 'Relief',
    source: RELIEF_TILE_SOURCE,
    attribution: SWISSTOPO_ATTRIBUTION,
  },
  {
    id: 'pixel-color',
    label: 'Pixelkarte farbig',
    source: PIXELKARTE_COLOR_TILE_SOURCE,
    showsRailwayLines: true,
    attribution: SWISSTOPO_ATTRIBUTION,
  },
  {
    id: 'pixel-grey',
    label: 'Pixelkarte grau',
    source: PIXELKARTE_GREY_TILE_SOURCE,
    showsRailwayLines: true,
    attribution: SWISSTOPO_ATTRIBUTION,
  },
  { id: 'black', label: 'Schwarz', source: null },
];
