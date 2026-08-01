import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LongDistancePulse } from './longDistancePulse.js';

const LONG_DISTANCE = new Set([0, 1]);

const stationPoints = [
  [2_600_000, 1_200_000],
  [2_610_000, 1_210_000],
];

const trip = (category, events) => ({ category, events });
const stop = (station, arr, dep) => ({ station, arr, dep });

// A step of a full second closes the whole easing gap, so a single update lands
// the intensity exactly on its target and the tests stay arithmetic.
const settle = (pulse, t) => {
  pulse.update(t, 1);
  return pulse;
};

const intensityAt = (pulse, station, t) =>
  settle(pulse, t).intensityByStation.get(station);

test('only long-distance trips make a station pulse', () => {
  const pulse = new LongDistancePulse(
    [
      trip(3, [stop(0, 1_000, 1_200)]),
      trip(6, [stop(0, 1_000, 1_200)]),
      trip(0, [stop(1, 1_000, 1_200)]),
    ],
    stationPoints,
    LONG_DISTANCE,
  );
  assert.equal(intensityAt(pulse, 0, 1_100), undefined);
  assert.equal(intensityAt(pulse, 1, 1_100), 1);
});

test('the intensity is the square root of the trains present', () => {
  const pulse = new LongDistancePulse(
    [
      trip(0, [stop(0, 1_000, 1_200)]),
      trip(1, [stop(0, 1_050, 1_300)]),
      trip(0, [stop(0, 1_100, 1_400)]),
      trip(0, [stop(0, 1_150, 1_500)]),
    ],
    stationPoints,
    LONG_DISTANCE,
  );
  assert.equal(intensityAt(pulse, 0, 1_020), 1);
  assert.equal(intensityAt(pulse, 0, 1_180), 2);
  assert.equal(intensityAt(pulse, 0, 1_450), 1);
});

test('an instantaneous dwell is held long enough to be seen', () => {
  const pulse = new LongDistancePulse(
    [trip(0, [stop(0, 1_000, 1_000)])],
    stationPoints,
    LONG_DISTANCE,
  );
  assert.equal(intensityAt(pulse, 0, 1_080), 1);
  assert.equal(intensityAt(pulse, 0, 1_100), 0);
});

test('the intensity eases towards its target instead of jumping', () => {
  const pulse = new LongDistancePulse(
    [trip(0, [stop(0, 1_000, 2_000)])],
    stationPoints,
    LONG_DISTANCE,
  );
  pulse.update(1_500, 0.05);
  const afterOneStep = pulse.intensityByStation.get(0);
  assert.ok(afterOneStep > 0 && afterOneStep < 1);
  pulse.update(1_500, 0.05);
  assert.ok(pulse.intensityByStation.get(0) > afterOneStep);
});

test('visiblePulses carries the station point and drops faded stations', () => {
  const pulse = new LongDistancePulse(
    [trip(0, [stop(1, 1_000, 2_000)])],
    stationPoints,
    LONG_DISTANCE,
  );
  assert.deepEqual(settle(pulse, 1_500).visiblePulses(), [
    { east: 2_610_000, north: 1_210_000, intensity: 1 },
  ]);
  assert.deepEqual(settle(pulse, 5_000).visiblePulses(), []);
});
