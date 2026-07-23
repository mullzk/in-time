import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Camera } from './camera.js';
import { nearestStation, nodeDiameterPixels } from './stationNodes.js';

test('nodeDiameterPixels hides nodes below the half zoom', () => {
  assert.equal(nodeDiameterPixels(0), 0);
  assert.equal(nodeDiameterPixels(0.49), 0);
});

test('nodeDiameterPixels is 3px from the half zoom to the second-largest step', () => {
  assert.equal(nodeDiameterPixels(0.5), 3);
  assert.equal(nodeDiameterPixels(0.7), 3);
  assert.equal(nodeDiameterPixels(5 / 6 - 1e-9), 3);
});

test('nodeDiameterPixels is 5px from the second-largest step', () => {
  assert.equal(nodeDiameterPixels(5 / 6), 5);
  assert.equal(nodeDiameterPixels(1), 5);
});

const stationAt = (east, north) => ({ east, north, name: `${east}/${north}` });

test('nearestStation returns the station under the screen point', () => {
  const camera = new Camera(1300, 800);
  camera.setZoomFraction(0.6);
  const station = stationAt(2_600_000, 1_200_000);
  const [x, y] = camera.worldToScreen(station.east, station.north);
  assert.equal(nearestStation([station], camera, x, y, 8), station);
});

test('nearestStation returns null beyond the pixel radius', () => {
  const camera = new Camera(1300, 800);
  camera.setZoomFraction(0.6);
  const station = stationAt(2_600_000, 1_200_000);
  const [x, y] = camera.worldToScreen(station.east, station.north);
  assert.equal(nearestStation([station], camera, x + 40, y, 8), null);
});

test('nearestStation picks the closer of two stations', () => {
  const camera = new Camera(1300, 800);
  camera.setZoomFraction(0.7);
  const near = stationAt(2_600_000, 1_200_000);
  const far = stationAt(2_601_000, 1_200_000);
  const [x, y] = camera.worldToScreen(near.east, near.north);
  assert.equal(nearestStation([far, near], camera, x, y, 50), near);
});
