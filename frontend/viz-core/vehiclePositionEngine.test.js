import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { VehiclePositionEngine } from './vehiclePositionEngine.js';

const bytes = readFileSync(
  new URL('./fixtures/golden-day.itsb', import.meta.url),
);
const buffer = bytes.buffer.slice(
  bytes.byteOffset,
  bytes.byteOffset + bytes.byteLength,
);
const engine = new VehiclePositionEngine(buffer);

const closeTo = (actual, expected, tolerance) =>
  Math.abs(actual - expected) <= tolerance;

const positionAt = (t, tripIndex) =>
  engine.activeAt(t).find((train) => train.tripIndex === tripIndex);

test('the golden blob decodes to the expected counts', () => {
  assert.equal(engine.stationCount, 3);
  assert.equal(engine.edgeCount, 2);
  assert.equal(engine.tripCount, 2);
});

test('edge cumulation reproduces the polyline length', () => {
  engine.edges.forEach((polyline, index) => {
    let expected = 0;
    for (let point = 1; point < polyline.length; point += 1) {
      expected += Math.hypot(
        polyline[point][0] - polyline[point - 1][0],
        polyline[point][1] - polyline[point - 1][1],
      );
    }
    assert.ok(closeTo(engine.edgeLengths[index], expected, 1e-6));
  });
});

test('the operating window spans first departure to last arrival', () => {
  assert.equal(engine.rangeStart, 36_000);
  assert.equal(engine.rangeEnd, 40_600);
});

test('activeAt filters by the trip window', () => {
  assert.equal(engine.activeAt(35_000).length, 0);
  assert.deepEqual(
    engine.activeAt(36_300).map((train) => train.tripIndex),
    [0],
  );
  assert.deepEqual(
    engine.activeAt(40_300).map((train) => train.tripIndex),
    [1],
  );
  assert.equal(engine.activeAt(41_000).length, 0);
});

test('a dwelling train sits exactly on its station', () => {
  const atStart = positionAt(36_000, 0);
  assert.ok(closeTo(atStart.east, 2_600_000, 1));
  assert.ok(closeTo(atStart.north, 1_200_000, 1));

  const atArrival = positionAt(37_260, 0);
  assert.ok(closeTo(atArrival.east, 2_610_000, 1));
  assert.ok(closeTo(atArrival.north, 1_210_000, 1));
});

test('a reversed straight edge interpolates to the geometric midpoint', () => {
  const midLeg0 = positionAt(36_300, 0);
  assert.ok(closeTo(midLeg0.east, 2_605_000, 1));
  assert.ok(closeTo(midLeg0.north, 1_200_000, 1));
});

test('a three-point bend interpolates along its arc length', () => {
  const midLeg1 = positionAt(36_960, 0);
  assert.ok(closeTo(midLeg1.east, 2_613_000, 1));
  assert.ok(closeTo(midLeg1.north, 1_205_000, 1));
});

test('activeAt depends only on t', () => {
  const first = engine.activeAt(36_450);
  const second = engine.activeAt(36_450);
  assert.deepEqual(first, second);
});
