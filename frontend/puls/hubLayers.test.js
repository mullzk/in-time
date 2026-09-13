import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  CORE_MINIMUM_RADIUS_PIXELS,
  HUB_LAYER_OPACITY,
  hubLayerRadii,
} from './hubLayers.js';
import { INTERREGIO, LONG_DISTANCE, REGIONAL } from './trainClasses.js';

const counts = (longDistance, interregio, regional) => ({
  [LONG_DISTANCE]: longDistance,
  [INTERREGIO]: interregio,
  [REGIONAL]: regional,
});

const ringWidth = ({ inner, outer }) => outer - inner;
const closeTo = (actual, expected) =>
  assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} ≠ ${expected}`);

test('an empty hub shows its core at the minimum radius and no rings', () => {
  const radii = hubLayerRadii(counts(0, 0, 0));
  assert.deepEqual(radii[LONG_DISTANCE], {
    inner: 0,
    outer: CORE_MINIMUM_RADIUS_PIXELS,
  });
  assert.equal(ringWidth(radii[INTERREGIO]), 0);
  assert.equal(ringWidth(radii[REGIONAL]), 0);
});

test('each IC/EC adds the same to the core radius, so the core swells quadratically', () => {
  const growth = (standing) =>
    hubLayerRadii(counts(standing, 0, 0))[LONG_DISTANCE].outer -
    CORE_MINIMUM_RADIUS_PIXELS;
  closeTo(growth(4), 4 * growth(1));
  assert.ok(growth(1) > 0);
});

test('each IR adds the same width to its ring, however large the core', () => {
  const width = (longDistance, interregio) =>
    ringWidth(hubLayerRadii(counts(longDistance, interregio, 0))[INTERREGIO]);
  closeTo(width(0, 3), 3 * width(0, 1));
  closeTo(width(6, 1), width(0, 1));
});

test('each regional train adds the same width to its ring, however large the hub inside', () => {
  const width = (longDistance, interregio, regional) =>
    ringWidth(
      hubLayerRadii(counts(longDistance, interregio, regional))[REGIONAL],
    );
  closeTo(width(0, 0, 3), 3 * width(0, 0, 1));
  closeTo(width(8, 5, 1), width(0, 0, 1));
  assert.ok(width(0, 0, 1) > 0);
});

test('the layers nest without gap or overlap', () => {
  const radii = hubLayerRadii(counts(2, 3, 4));
  assert.equal(radii[INTERREGIO].inner, radii[LONG_DISTANCE].outer);
  assert.equal(radii[REGIONAL].inner, radii[INTERREGIO].outer);
});

test('counts part-way between two whole trains give radii part-way between', () => {
  const at = (interregio) =>
    hubLayerRadii(counts(0, interregio, 0))[INTERREGIO].outer;
  closeTo(at(1.5), (at(1) + at(2)) / 2);
});

test('the core is opaque and the rings grow more translucent outwards', () => {
  assert.equal(HUB_LAYER_OPACITY[LONG_DISTANCE], 1);
  assert.equal(HUB_LAYER_OPACITY[INTERREGIO], 0.6);
  assert.equal(HUB_LAYER_OPACITY[REGIONAL], 0.3);
});
