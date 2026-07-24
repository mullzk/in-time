import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Camera } from './camera.js';
import {
  dominantStationMode,
  fallbackModeForStops,
  nearestStation,
  nodeDiameterPixels,
  stationIsShown,
  stopsToggleOnZoomCross,
} from './stationNodes.js';

test('nodeDiameterPixels is 3px below the second-largest zoom step', () => {
  assert.equal(nodeDiameterPixels(0), 3);
  assert.equal(nodeDiameterPixels(0.49), 3);
  assert.equal(nodeDiameterPixels(0.7), 3);
  assert.equal(nodeDiameterPixels(5 / 6 - 1e-9), 3);
});

test('nodeDiameterPixels is 5px from the second-largest step', () => {
  assert.equal(nodeDiameterPixels(5 / 6), 5);
  assert.equal(nodeDiameterPixels(1), 5);
});

test('stationIsShown needs the stops layer and a visible mode', () => {
  const layers = { rail: true, tram: false, bus: false };
  assert.equal(stationIsShown(['rail'], true, layers), true);
  assert.equal(stationIsShown(['rail'], false, layers), false);
  assert.equal(stationIsShown(['tram'], true, layers), false);
  // One visible mode is enough for a multi-mode station.
  assert.equal(stationIsShown(['tram', 'rail'], true, layers), true);
});

test('dominantStationMode ranks rail over tram over bus', () => {
  assert.equal(dominantStationMode(['bus', 'tram', 'rail']), 'rail');
  assert.equal(dominantStationMode(['bus', 'tram']), 'tram');
  assert.equal(dominantStationMode(['bus']), 'bus');
  assert.equal(dominantStationMode([]), null);
});

test('fallbackModeForStops adds rail only when every mode is off', () => {
  assert.equal(
    fallbackModeForStops({ rail: false, tram: false, bus: false }),
    'rail',
  );
  assert.equal(
    fallbackModeForStops({ rail: false, tram: true, bus: false }),
    null,
  );
  assert.equal(
    fallbackModeForStops({ rail: true, tram: false, bus: false }),
    null,
  );
});

test('stopsToggleOnZoomCross toggles only when the threshold is crossed', () => {
  assert.equal(stopsToggleOnZoomCross(0.4, 0.6, 0.5), true);
  assert.equal(stopsToggleOnZoomCross(0.4, 0.5, 0.5), true);
  assert.equal(stopsToggleOnZoomCross(0.6, 0.4, 0.5), false);
  assert.equal(stopsToggleOnZoomCross(0.6, 0.7, 0.5), null);
  assert.equal(stopsToggleOnZoomCross(0.3, 0.4, 0.5), null);
  assert.equal(stopsToggleOnZoomCross(0.5, 0.5, 0.5), null);
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
