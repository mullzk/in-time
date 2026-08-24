import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  fallbackLayerForStops,
  layersDownTo,
  layerToRevealStation,
  stationIsShown,
  stopsToggleOnZoomCross,
} from './vehicleLayers.js';

test('stationIsShown needs the stops layer and a visible mode', () => {
  const layers = {
    fernverkehr: true,
    interregio: false,
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

test('stationIsShown surfaces a rail station for any rail layer', () => {
  const onlyRegional = {
    fernverkehr: false,
    interregio: false,
    regionalverkehr: true,
    tram: false,
    bus: false,
  };
  assert.equal(stationIsShown(['rail'], true, onlyRegional), true);
  const onlyInterregio = {
    fernverkehr: false,
    interregio: true,
    regionalverkehr: false,
    tram: false,
    bus: false,
  };
  assert.equal(stationIsShown(['rail'], true, onlyInterregio), true);
  const noRail = {
    fernverkehr: false,
    interregio: false,
    regionalverkehr: false,
    tram: true,
    bus: false,
  };
  assert.equal(stationIsShown(['rail'], true, noRail), false);
});

test('fallbackLayerForStops adds regional rail only when every layer is off', () => {
  assert.equal(
    fallbackLayerForStops({
      fernverkehr: false,
      interregio: false,
      regionalverkehr: false,
      tram: false,
      bus: false,
    }),
    'regionalverkehr',
  );
  assert.equal(
    fallbackLayerForStops({
      fernverkehr: false,
      interregio: false,
      regionalverkehr: false,
      tram: true,
      bus: false,
    }),
    null,
  );
  assert.equal(
    fallbackLayerForStops({
      fernverkehr: false,
      interregio: true,
      regionalverkehr: false,
      tram: false,
      bus: false,
    }),
    null,
  );
  assert.equal(
    fallbackLayerForStops({
      fernverkehr: true,
      interregio: false,
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
    interregio: true,
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
    interregio: false,
    regionalverkehr: false,
    tram: false,
    bus: true,
  };
  assert.equal(layerToRevealStation(['bus'], busOnly), null);
});

test('layersDownTo names the layer and every more structural one', () => {
  assert.deepEqual(layersDownTo('bus'), [
    'fernverkehr',
    'interregio',
    'regionalverkehr',
    'tram',
    'bus',
  ]);
  assert.deepEqual(layersDownTo('tram'), [
    'fernverkehr',
    'interregio',
    'regionalverkehr',
    'tram',
  ]);
  assert.deepEqual(layersDownTo('fernverkehr'), ['fernverkehr']);
});

test('layersDownTo names nothing for a layer that carries no vehicles', () => {
  assert.deepEqual(layersDownTo('stops'), []);
});

test('stopsToggleOnZoomCross toggles only when the threshold is crossed', () => {
  assert.equal(stopsToggleOnZoomCross(0.4, 0.6, 0.5), true);
  assert.equal(stopsToggleOnZoomCross(0.4, 0.5, 0.5), true);
  assert.equal(stopsToggleOnZoomCross(0.6, 0.4, 0.5), false);
  assert.equal(stopsToggleOnZoomCross(0.6, 0.7, 0.5), null);
  assert.equal(stopsToggleOnZoomCross(0.3, 0.4, 0.5), null);
  assert.equal(stopsToggleOnZoomCross(0.5, 0.5, 0.5), null);
});
