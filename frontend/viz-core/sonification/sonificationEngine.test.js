import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { VehiclePositionEngine } from '../travel/vehiclePositionEngine.js';
import { SonificationEngine } from './sonificationEngine.js';

const bytes = readFileSync(
  new URL('../fixtures/golden-rail-day.itsb', import.meta.url),
);
const buffer = bytes.buffer.slice(
  bytes.byteOffset,
  bytes.byteOffset + bytes.byteLength,
);
const engine = new SonificationEngine(new VehiclePositionEngine(buffer).trips);

test('an origin pass-through yields a single event at that station', () => {
  assert.deepEqual(engine.eventsAtStation(0), [
    { time: 36000, kind: 'passthrough', category: 0 },
  ]);
});

test('a dwelling stop yields an arrival with dwell and a departure', () => {
  const events = engine.eventsAtStation(1);
  assert.deepEqual(events.slice(0, 2), [
    { time: 36600, kind: 'arrival', category: 0, dwellSeconds: 60 },
    { time: 36660, kind: 'departure', category: 0 },
  ]);
});

test('a station served by two trips merges their events in time order', () => {
  assert.deepEqual(engine.eventsAtStation(1), [
    { time: 36600, kind: 'arrival', category: 0, dwellSeconds: 60 },
    { time: 36660, kind: 'departure', category: 0 },
    { time: 40000, kind: 'passthrough', category: 3 },
  ]);
  assert.deepEqual(engine.eventsAtStation(2), [
    { time: 37260, kind: 'passthrough', category: 0 },
    { time: 40600, kind: 'passthrough', category: 3 },
  ]);
});

test('a station with no events yields an empty list', () => {
  assert.deepEqual(engine.eventsAtStation(99), []);
});

test('a cluster collapses a trip run through its members into one visit', () => {
  // Trip 0 calls at stations 0 and 1 in a row; as one cluster its arrival is the
  // first stop's, its departure the last stop's, and the dwell spans both.
  assert.deepEqual(engine.eventsAtCluster([0, 1]), [
    { time: 36000, kind: 'arrival', category: 0, dwellSeconds: 660 },
    { time: 36660, kind: 'departure', category: 0 },
    { time: 40000, kind: 'passthrough', category: 3 },
  ]);
});

test('a single-member cluster matches eventsAtStation', () => {
  assert.deepEqual(engine.eventsAtCluster([2]), engine.eventsAtStation(2));
});

// A trip that leaves a cluster and returns later counts as two separate visits;
// a synthetic engine makes the re-entry explicit.
const reentryEngine = new SonificationEngine([
  {
    category: 6,
    events: [
      { station: 20, arr: 0, dep: 0 },
      { station: 21, arr: 10, dep: 10 },
      { station: 20, arr: 30, dep: 30 },
    ],
  },
]);

test('a trip re-entering a cluster yields two visits, not one long dwell', () => {
  assert.deepEqual(reentryEngine.eventsAtCluster([20]), [
    { time: 0, kind: 'passthrough', category: 6 },
    { time: 30, kind: 'passthrough', category: 6 },
  ]);
});
