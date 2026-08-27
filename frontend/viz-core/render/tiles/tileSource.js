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
export const SWISSVIEW_TILE_SOURCE = tileSource(
  'ch.swisstopo.swissimage',
  'jpeg',
);

// The two Landeskarten are one background, each shown where it is the better
// map: the grey one over the overview, where the colour print collapses into a
// wash of area tints that says nothing at that scale, and the colour one from
// the middle of the zoom on, where its detail is what one has come for. The
// level is swisstopo's own, so the switch follows the map's detail rather than
// the size of the window.
const COLOUR_FROM_LEVEL = 18;

export const LANDESKARTE_TILE_SOURCE = {
  urlFor: (z, x, y) =>
    z >= COLOUR_FROM_LEVEL
      ? PIXELKARTE_COLOR_TILE_SOURCE.urlFor(z, x, y)
      : PIXELKARTE_GREY_TILE_SOURCE.urlFor(z, x, y),
};

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
    id: 'pixel',
    label: 'Landeskarte',
    source: LANDESKARTE_TILE_SOURCE,
    showsRailwayLines: true,
    attribution: SWISSTOPO_ATTRIBUTION,
  },
  {
    id: 'swissview',
    label: 'Luftaufnahme',
    source: SWISSVIEW_TILE_SOURCE,
    showsRailwayLines: true,
    attribution: SWISSTOPO_ATTRIBUTION,
  },
  { id: 'black', label: 'Schwarz', source: null },
];
