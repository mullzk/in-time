import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  LV95_TILE_ORIGIN,
  selectLevel,
  tileSpanMetres,
  tileWorldBounds,
  visibleTiles,
  worldToTile,
} from './tileMatrixSet.js';

test('a tile spans resolution times 256 pixels in metres', () => {
  assert.equal(tileSpanMetres(16), 250 * 256);
});

test('worldToTile matches the verified swisstopo landmarks (Bern HB)', () => {
  assert.deepEqual(worldToTile(16, 2_600_000, 1_200_000), { col: 2, row: 2 });
  assert.deepEqual(worldToTile(23, 2_600_000, 1_200_000), {
    col: 351,
    row: 292,
  });
});

test('the grid origin is tile 0/0', () => {
  assert.deepEqual(
    worldToTile(16, LV95_TILE_ORIGIN.east, LV95_TILE_ORIGIN.north),
    { col: 0, row: 0 },
  );
});

test('adjacent tile bounds abut without gap or overlap', () => {
  const bounds = tileWorldBounds(20, 70, 58);
  assert.equal(tileWorldBounds(20, 71, 58).eastMin, bounds.eastMax);
  assert.equal(tileWorldBounds(20, 70, 59).northMax, bounds.northMin);
});

test('a tile centre round-trips back to the same tile', () => {
  const bounds = tileWorldBounds(23, 351, 292);
  const centreEast = (bounds.eastMin + bounds.eastMax) / 2;
  const centreNorth = (bounds.northMin + bounds.northMax) / 2;
  assert.deepEqual(worldToTile(23, centreEast, centreNorth), {
    col: 351,
    row: 292,
  });
});

test('selectLevel picks the resolution closest in log ratio', () => {
  assert.equal(selectLevel(250), 16);
  assert.equal(selectLevel(2.2), 23);
});

test('selectLevel is monotonic: coarser view never yields a finer level', () => {
  const worldPerPixels = [0.4, 1, 2.2, 10, 60, 240, 700];
  const levels = worldPerPixels.map(selectLevel);
  levels.slice(1).forEach((level, index) => {
    assert.ok(level <= levels[index]);
  });
});

test('selectLevel clamps to the embedded level window', () => {
  assert.equal(selectLevel(100_000), 14);
  assert.equal(selectLevel(0.001), 26);
});

test('visibleTiles covers exactly the tiles under a 2x2 world rectangle', () => {
  const level = 20;
  const anchor = tileWorldBounds(level, 70, 58);
  const neighbour = tileWorldBounds(level, 71, 59);
  const worldBounds = {
    eastMin: anchor.eastMin + 1,
    eastMax: neighbour.eastMax - 1,
    northMin: neighbour.northMin + 1,
    northMax: anchor.northMax - 1,
  };
  const tiles = visibleTiles(level, worldBounds);
  assert.equal(tiles.length, 4);
  const key = ({ col, row }) => `${col}/${row}`;
  const keys = new Set(tiles.map(key));
  ['70/58', '71/58', '70/59', '71/59'].forEach((expected) => {
    assert.ok(keys.has(expected));
  });
});

test('visibleTiles omits tiles left of the grid origin', () => {
  const level = 16;
  const origin = tileWorldBounds(level, 0, 0);
  const worldBounds = {
    eastMin: origin.eastMin - 3 * tileSpanMetres(level),
    eastMax: origin.eastMax - 1,
    northMin: origin.northMin + 1,
    northMax: origin.northMax - 1,
  };
  const tiles = visibleTiles(level, worldBounds);
  assert.ok(tiles.every(({ col }) => col >= 0));
});
