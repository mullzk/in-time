import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Camera } from './camera.js';
import {
  dominantStationMode,
  fallbackLayerForStops,
  layerToRevealStation,
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
  const layers = {
    fernverkehr: true,
    regionalverkehr: false,
    tram: false,
    bus: false,
  };
  assert.equal(stationIsShown(['rail'], true, layers), true);
  assert.equal(stationIsShown(['rail'], false, layers), false);
  assert.equal(stationIsShown(['tram'], true, layers), false);
  // One visible mode is enough for a multi-mode station.
  assert.equal(stationIsShown(['tram', 'rail'], true, layers), true);
});

test('stationIsShown surfaces a rail station for either rail layer', () => {
  const onlyRegional = {
    fernverkehr: false,
    regionalverkehr: true,
    tram: false,
    bus: false,
  };
  assert.equal(stationIsShown(['rail'], true, onlyRegional), true);
  const noRail = {
    fernverkehr: false,
    regionalverkehr: false,
    tram: true,
    bus: false,
  };
  assert.equal(stationIsShown(['rail'], true, noRail), false);
});

test('dominantStationMode ranks rail over tram over bus', () => {
  assert.equal(dominantStationMode(['bus', 'tram', 'rail']), 'rail');
  assert.equal(dominantStationMode(['bus', 'tram']), 'tram');
  assert.equal(dominantStationMode(['bus']), 'bus');
  assert.equal(dominantStationMode([]), null);
});

test('fallbackLayerForStops adds regional rail only when every layer is off', () => {
  assert.equal(
    fallbackLayerForStops({
      fernverkehr: false,
      regionalverkehr: false,
      tram: false,
      bus: false,
    }),
    'regionalverkehr',
  );
  assert.equal(
    fallbackLayerForStops({
      fernverkehr: false,
      regionalverkehr: false,
      tram: true,
      bus: false,
    }),
    null,
  );
  assert.equal(
    fallbackLayerForStops({
      fernverkehr: true,
      regionalverkehr: false,
      tram: false,
      bus: false,
    }),
    null,
  );
});

test('layerToRevealStation switches on a mode layer only when none reveals it', () => {
  const railDefaults = {
    fernverkehr: true,
    regionalverkehr: true,
    tram: false,
    bus: false,
  };
  // A bus-only station stays hidden under the rail defaults, so name its layer.
  assert.equal(stationIsShown(['bus'], true, railDefaults), false);
  assert.equal(layerToRevealStation(['bus'], railDefaults), 'bus');
  assert.equal(layerToRevealStation(['tram'], railDefaults), 'tram');
  // A rail station already shows, so nothing needs switching on.
  assert.equal(layerToRevealStation(['rail'], railDefaults), null);
  // One already-revealing layer is enough for a multi-mode station.
  assert.equal(layerToRevealStation(['rail', 'bus'], railDefaults), null);
});

test('layerToRevealStation leaves a station alone when its layer already shows', () => {
  const busOnly = {
    fernverkehr: false,
    regionalverkehr: false,
    tram: false,
    bus: true,
  };
  assert.equal(layerToRevealStation(['bus'], busOnly), null);
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
