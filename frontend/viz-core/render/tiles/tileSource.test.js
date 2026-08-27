import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BACKGROUNDS, LANDESKARTE_TILE_SOURCE } from './tileSource.js';

test('the overview is drawn on the grey Landeskarte', () => {
  assert.match(LANDESKARTE_TILE_SOURCE.urlFor(16, 2, 3), /pixelkarte-grau/);
  assert.match(LANDESKARTE_TILE_SOURCE.urlFor(17, 2, 3), /pixelkarte-grau/);
});

test('from the middle zoom on it is the colour one', () => {
  assert.match(LANDESKARTE_TILE_SOURCE.urlFor(18, 2, 3), /pixelkarte-farbe/);
  assert.match(LANDESKARTE_TILE_SOURCE.urlFor(21, 2, 3), /pixelkarte-farbe/);
});

test('a tile keeps the path its own layer would have given it', () => {
  assert.equal(
    LANDESKARTE_TILE_SOURCE.urlFor(18, 2, 3),
    '/tiles/ch.swisstopo.pixelkarte-farbe/18/2/3.jpeg',
  );
});

test('the two Landeskarten are offered as one background', () => {
  assert.deepEqual(
    BACKGROUNDS.filter(({ label }) => label.startsWith('Landeskarte')).map(
      ({ id, label }) => [id, label],
    ),
    [['pixel', 'Landeskarte']],
  );
});
