import assert from 'node:assert/strict';
import { test } from 'node:test';
import { wgs84ToLv95 } from './projection.js';

const metresApart = ([east, north], [refEast, refNorth]) =>
  Math.hypot(east - refEast, north - refNorth);

// Reference LV95 coordinates from a rigorous WGS84->EPSG:2056 transform
// (pyproj); the approximate formula must stay within ~1 m of them in-country.
const references = [
  {
    latitude: 46.95108,
    longitude: 7.43863,
    lv95: [2_599_999.82, 1_199_999.69],
  },
  {
    latitude: 47.378177,
    longitude: 8.540192,
    lv95: [2_683_188.02, 1_248_065.99],
  },
  { latitude: 46.21, longitude: 6.142, lv95: [2_499_933.71, 1_118_445.04] },
];

test('stays within a metre of rigorous reference points', () => {
  references.forEach(({ latitude, longitude, lv95 }) => {
    assert.ok(metresApart(wgs84ToLv95(latitude, longitude), lv95) <= 1);
  });
});

test('east grows eastward, north grows northward', () => {
  const [westEast] = wgs84ToLv95(46.8, 7.0);
  const [eastEast] = wgs84ToLv95(46.8, 8.0);
  assert.ok(eastEast > westEast);

  const [, southNorth] = wgs84ToLv95(46.5, 7.5);
  const [, northNorth] = wgs84ToLv95(47.5, 7.5);
  assert.ok(northNorth > southNorth);
});
