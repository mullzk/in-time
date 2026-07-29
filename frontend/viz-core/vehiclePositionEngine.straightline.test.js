import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { VehiclePositionEngine } from './vehiclePositionEngine.js';

const bytes = readFileSync(
  new URL('./fixtures/golden-bus-day.itsb', import.meta.url),
);
const buffer = bytes.buffer.slice(
  bytes.byteOffset,
  bytes.byteOffset + bytes.byteLength,
);
const engine = new VehiclePositionEngine(buffer);

const closeTo = (actual, expected, tolerance) =>
  Math.abs(actual - expected) <= tolerance;

const positionAt = (t) => engine.activeAt(t).find((v) => v.tripIndex === 0);

test('the bus blob decodes to a geometry-free schedule', () => {
  assert.equal(engine.stationCount, 3);
  assert.equal(engine.edgeCount, 0);
  assert.equal(engine.tripCount, 1);
});

test('a straight leg starts and ends exactly on its stations', () => {
  const atStart = positionAt(36_000);
  assert.ok(closeTo(atStart.east, 2_600_000, 1));
  assert.ok(closeTo(atStart.north, 1_200_000, 1));

  const atArrival = positionAt(37_260);
  assert.ok(closeTo(atArrival.east, 2_620_000, 1));
  assert.ok(closeTo(atArrival.north, 1_220_000, 1));
});

test('a straight leg interpolates to the geometric midpoint', () => {
  const midLeg0 = positionAt(36_300);
  assert.ok(closeTo(midLeg0.east, 2_610_000, 1));
  assert.ok(closeTo(midLeg0.north, 1_200_000, 1));

  const midLeg1 = positionAt(36_960);
  assert.ok(closeTo(midLeg1.east, 2_620_000, 1));
  assert.ok(closeTo(midLeg1.north, 1_210_000, 1));
});

test('a dwelling bus sits exactly on the intermediate station', () => {
  [36_600, 36_660].forEach((t) => {
    const dwelling = positionAt(t);
    assert.ok(closeTo(dwelling.east, 2_620_000, 1));
    assert.ok(closeTo(dwelling.north, 1_200_000, 1));
  });
});

test('the bus trip reports its bus category', () => {
  assert.equal(positionAt(36_300).category, 6);
});
