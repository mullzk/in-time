import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { VehiclePositionEngine } from './vehiclePositionEngine.js';

const bytes = readFileSync(
  new URL('../fixtures/golden-rail-day.itsb', import.meta.url),
);
const buffer = bytes.buffer.slice(
  bytes.byteOffset,
  bytes.byteOffset + bytes.byteLength,
);
const engine = new VehiclePositionEngine(buffer);

const closeTo = (actual, expected, tolerance) =>
  Math.abs(actual - expected) <= tolerance;

// A minimal ITSB v2 blob: one station at the origin, no edges, and `tripCount`
// single-event trips whose departure and arrival both sit at 36000 + tripIndex.
// It exists to drive #deriveOperatingWindow at a trip count above the JS engine
// spread-argument cap, which the golden fixtures (2 trips) never reach.
const buildSingleEventTripBlob = (tripCount) => {
  const stationCount = 1;
  const headerBytes = 88;
  const stationsBytes = stationCount * 8;
  const offsetStations = headerBytes;
  const offsetTrips = offsetStations + stationsBytes;
  const offsetEvents = offsetTrips + tripCount * 7;
  const totalBytes = offsetEvents + tripCount * 14;

  const buffer = new ArrayBuffer(totalBytes);
  const view = new DataView(buffer);

  [...'ITSB'].forEach((character, index) => {
    view.setUint8(index, character.charCodeAt(0));
  });
  view.setUint16(4, 2, true);
  view.setUint32(24, stationCount, true);
  view.setUint32(28, 0, true);
  view.setUint32(32, 0, true);
  view.setUint32(36, tripCount, true);
  view.setUint32(40, tripCount, true);
  view.setUint32(44, 0, true);
  view.setUint32(48, offsetStations, true);
  view.setUint32(52, offsetTrips, true);
  view.setUint32(56, offsetTrips, true);
  view.setUint32(60, offsetTrips, true);
  view.setUint32(64, offsetEvents, true);
  view.setUint32(68, offsetEvents, true);

  const eventStartColumn = offsetTrips + tripCount;
  const eventLengthColumn = offsetTrips + tripCount * 5;
  const arrivalColumn = offsetEvents + tripCount * 4;
  const departureColumn = offsetEvents + tripCount * 8;

  Array.from({ length: tripCount }).forEach((_, trip) => {
    view.setUint32(eventStartColumn + trip * 4, trip, true);
    view.setUint16(eventLengthColumn + trip * 2, 1, true);
    const seconds = 36_000 + trip;
    view.setUint32(arrivalColumn + trip * 4, seconds, true);
    view.setUint32(departureColumn + trip * 4, seconds, true);
  });

  return buffer;
};

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

test('the operating window derives past the spread-argument cap', () => {
  const tripCount = 130_000;
  const engine = new VehiclePositionEngine(buildSingleEventTripBlob(tripCount));
  assert.equal(engine.tripCount, tripCount);
  assert.equal(engine.rangeStart, 36_000);
  assert.equal(engine.rangeEnd, 36_000 + tripCount - 1);
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

test('tripEndpoints reports the first and last stop of a trip', () => {
  assert.deepEqual(engine.tripEndpoints(0), {
    originStation: 0,
    destinationStation: 2,
  });
  assert.deepEqual(engine.tripEndpoints(1), {
    originStation: 1,
    destinationStation: 2,
  });
});

test('trailPositions samples the trip backwards in schedule time', () => {
  const trail = engine.trailPositions(0, 36_300, 3, 150);
  assert.equal(trail.length, 3);
  trail.forEach((position, sample) => {
    const expected = engine.positionAt(0, 36_300 - sample * 150);
    assert.ok(closeTo(position.east, expected.east, 1e-6));
    assert.ok(closeTo(position.north, expected.north, 1e-6));
  });
});

test('a trail ends where the trip had not yet departed', () => {
  const trail = engine.trailPositions(0, 36_300, 4, 200);
  assert.equal(engine.positionAt(0, 35_900), null);
  assert.equal(trail.length, 2);
  const last = engine.positionAt(0, 36_100);
  assert.ok(closeTo(trail[1].east, last.east, 1e-6));
  assert.ok(closeTo(trail[1].north, last.north, 1e-6));
});

test('positionAt matches activeAt inside the window and is null outside', () => {
  assert.equal(engine.positionAt(0, 35_000), null);
  assert.equal(engine.positionAt(0, 41_000), null);
  const viaActive = positionAt(36_300, 0);
  const direct = engine.positionAt(0, 36_300);
  assert.ok(closeTo(direct.east, viaActive.east, 1e-6));
  assert.ok(closeTo(direct.north, viaActive.north, 1e-6));
});
