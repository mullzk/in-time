import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { VehiclePositionEngine } from '../vehiclePositionEngine.js';
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
