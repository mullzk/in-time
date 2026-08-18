import assert from 'node:assert/strict';
import { test } from 'node:test';
import { placesOfReachedStations } from './places.js';

// Four stops: one standing alone, and three of one interchange named by the
// didok of its middle one.
const DIDOKS = [100, 200, 201, 202];
const CLUSTERS = new Map([
  [1, 200],
  [2, 200],
  [3, 200],
]);

const connections = {
  didokOf: (station) => DIDOKS[station],
  stationOf: (didok) => DIDOKS.indexOf(didok),
  clusterOf: (station) => CLUSTERS.get(station) ?? null,
};

const catalogOf = (knownDidoks) => ({
  entryOf: (didok) => (knownDidoks.includes(didok) ? { didok } : null),
});

const treeReaching = (stations) => ({ reachedStations: () => stations });

test('the stops of an interchange gather into one place', () => {
  const places = placesOfReachedStations(
    treeReaching([0, 1, 2, 3]),
    connections,
    catalogOf(DIDOKS),
  );

  assert.deepEqual(
    places.map((place) => place.members),
    [[0], [1, 2, 3]],
  );
});

test('an interchange answers to the stop it is named by', () => {
  const [, interchange] = placesOfReachedStations(
    treeReaching([0, 1, 2, 3]),
    connections,
    catalogOf(DIDOKS),
  );

  assert.equal(connections.didokOf(interchange.principalStation), 200);
});

test('where the named stop stays unreached another speaks for the place', () => {
  const [interchange] = placesOfReachedStations(
    treeReaching([2, 3]),
    connections,
    catalogOf(DIDOKS),
  );

  assert.equal(connections.didokOf(interchange.principalStation), 201);
});

test('a stop the catalog cannot name is no place', () => {
  const places = placesOfReachedStations(
    treeReaching([0, 1]),
    connections,
    catalogOf([200, 201, 202]),
  );

  assert.deepEqual(
    places.map((place) => place.members),
    [[1]],
  );
});
