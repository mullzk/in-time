import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { VehiclePositionEngine } from '../travel/vehiclePositionEngine.js';
import { readStationPoints } from './blobStations.js';

const bytes = readFileSync(
  new URL('../fixtures/golden-rail-day.itsb', import.meta.url),
);
const buffer = bytes.buffer.slice(
  bytes.byteOffset,
  bytes.byteOffset + bytes.byteLength,
);

test('readStationPoints returns one LV95 point per blob station', () => {
  const points = readStationPoints(buffer);
  assert.equal(points.length, 3);
  points.forEach(([east, north]) => {
    assert.ok(east > 2_400_000 && east < 2_900_000);
    assert.ok(north > 1_000_000 && north < 1_300_000);
  });
});

test('readStationPoints agrees with the engine station parser', () => {
  const engine = new VehiclePositionEngine(buffer);
  assert.deepEqual(readStationPoints(buffer), engine.stations);
});

test('readStationPoints rejects a non-ITSB buffer', () => {
  assert.throws(() => readStationPoints(new ArrayBuffer(64)));
});
