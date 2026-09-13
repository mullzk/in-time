import assert from 'node:assert/strict';
import { test } from 'node:test';
import { edgesTravelledBy } from './network.js';

const EDGES = [
  [
    [0, 0],
    [1, 0],
  ],
  [
    [1, 0],
    [2, 0],
  ],
  [
    [2, 0],
    [3, 0],
  ],
];

const trip = (category, legEdges) => ({
  category,
  events: legEdges.map((edges) => ({ legEdges: edges })),
});

test('the network is the track run by shown trains, each stretch drawn once', () => {
  const trips = [
    trip(0, [[1, 2], []]),
    trip(3, [[-2], []]),
    trip(5, [[3], []]),
  ];
  assert.deepEqual(edgesTravelledBy(trips, EDGES), [EDGES[0], EDGES[1]]);
});

test('without shown trains there is no network', () => {
  assert.deepEqual(edgesTravelledBy([trip(6, [[1], []])], EDGES), []);
});
