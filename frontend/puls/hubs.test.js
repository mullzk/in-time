import assert from 'node:assert/strict';
import { test } from 'node:test';
import { hubLayerRadii } from './hubLayers.js';
import { HUB_DIDOKS, hubsOf } from './hubs.js';
import { INTERREGIO, LONG_DISTANCE, REGIONAL } from './trainClasses.js';

const [FIRST_HUB] = HUB_DIDOKS;
const OUTSIDE = 1_000_001;

const STATIONS = [
  { didok: OUTSIDE, name: 'Irgendwo' },
  { didok: FIRST_HUB, name: 'Erster Knoten', cluster: FIRST_HUB },
  { didok: 1_000_002, name: 'Erster Knoten Nebenperron', cluster: FIRST_HUB },
];
const POSITIONS = [
  [2_600_000, 1_200_000],
  [2_610_000, 1_210_000],
  [2_610_100, 1_210_100],
];

const call = (station, arr, dep) => ({ station, arr, dep });

const TRIPS = [
  {
    category: 0,
    events: [call(0, 0, 0), call(1, 100, 200), call(0, 400, 400)],
  },
  {
    category: 2,
    events: [call(0, 0, 0), call(2, 150, 250), call(0, 400, 400)],
  },
];

test('the Swiss base hubs are Basel, Zürich, Bern, Olten, Luzern, St. Gallen and Chur', () => {
  assert.deepEqual(
    HUB_DIDOKS,
    [8500010, 8503000, 8507000, 8500218, 8505000, 8506302, 8509000],
  );
});

test('a hub stands where its station stands and carries its name', () => {
  const [hub] = hubsOf(STATIONS, POSITIONS, TRIPS);
  assert.equal(hub.name, 'Erster Knoten');
  assert.equal(hub.east, 2_610_000);
  assert.equal(hub.north, 1_210_000);
});

test('a hub missing from the published day is left out', () => {
  assert.equal(hubsOf(STATIONS, POSITIONS, TRIPS).length, 1);
});

test('a hub counts the trains standing at every station of its cluster', () => {
  const [hub] = hubsOf(STATIONS, POSITIONS, TRIPS);
  hub.easeTowardsTheTrainsStandingAt(175, 0);
  assert.deepEqual(
    hub.layerRadii(),
    hubLayerRadii({ [LONG_DISTANCE]: 1, [INTERREGIO]: 0, [REGIONAL]: 1 }),
  );
});
