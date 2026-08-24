// swisstopo LV95 (EPSG:2056) tile grid. Only the level window our camera can
// reach is embedded (swisstopo publishes 0-28); the resolutions are swisstopo's
// non-uniform published steps. On the wire a tile is
// `/{z}/{x}/{y}` with x = TileCol (eastward), y = TileRow (northward from the
// top-left origin), verified against swisstopo's REST template.
export const TILE_SIZE_PIXELS = 256;

export const LV95_TILE_ORIGIN = { east: 2_420_000, north: 1_350_000 };

const RESOLUTION_METRES_PER_PIXEL = {
  14: 650,
  15: 500,
  16: 250,
  17: 100,
  18: 50,
  19: 20,
  20: 10,
  21: 5,
  22: 2.5,
  23: 2,
  24: 1.5,
  25: 1,
  26: 0.5,
};

const LEVELS = Object.keys(RESOLUTION_METRES_PER_PIXEL).map(Number);

export function tileSpanMetres(level) {
  return RESOLUTION_METRES_PER_PIXEL[level] * TILE_SIZE_PIXELS;
}

export function worldToTile(level, east, north) {
  const span = tileSpanMetres(level);
  return {
    col: Math.floor((east - LV95_TILE_ORIGIN.east) / span),
    row: Math.floor((LV95_TILE_ORIGIN.north - north) / span),
  };
}

export function tileWorldBounds(level, col, row) {
  const span = tileSpanMetres(level);
  const eastMin = LV95_TILE_ORIGIN.east + col * span;
  const northMax = LV95_TILE_ORIGIN.north - row * span;
  return {
    eastMin,
    eastMax: eastMin + span,
    northMin: northMax - span,
    northMax,
  };
}

export function selectLevel(worldPerPixel) {
  return LEVELS.reduce((best, level) => {
    const distance = Math.abs(
      Math.log(RESOLUTION_METRES_PER_PIXEL[level] / worldPerPixel),
    );
    const bestDistance = Math.abs(
      Math.log(RESOLUTION_METRES_PER_PIXEL[best] / worldPerPixel),
    );
    return distance < bestDistance ? level : best;
  }, LEVELS[0]);
}

const rangeInclusive = (from, to) =>
  Array.from({ length: to - from + 1 }, (_, offset) => from + offset);

export function visibleTiles(level, worldBounds) {
  const topLeft = worldToTile(level, worldBounds.eastMin, worldBounds.northMax);
  const bottomRight = worldToTile(
    level,
    worldBounds.eastMax,
    worldBounds.northMin,
  );
  return rangeInclusive(topLeft.col, bottomRight.col)
    .flatMap((col) =>
      rangeInclusive(topLeft.row, bottomRight.row).map((row) => ({ col, row })),
    )
    .filter(({ col, row }) => col >= 0 && row >= 0);
}
