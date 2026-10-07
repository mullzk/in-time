import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FOLLOW_HALF_LIFE_SECONDS, followedCentre } from './cameraFollow.js';

const closeTo = (actual, expected) => Math.abs(actual - expected) <= 1e-6;
const origin = { east: 0, north: 0 };

test('no elapsed time leaves a still target where it is', () => {
  const centre = followedCentre({ east: 100, north: 50 }, origin, origin, 0);
  assert.deepEqual(centre, { east: 100, north: 50 });
});

test('one half-life halves the offset to a still target', () => {
  const centre = followedCentre(
    { east: 100, north: 50 },
    origin,
    origin,
    FOLLOW_HALF_LIFE_SECONDS,
  );
  assert.ok(closeTo(centre.east, 50));
  assert.ok(closeTo(centre.north, 25));
});

test('a centred target is ridden along with, however far it moved', () => {
  const centre = followedCentre(
    { east: 100, north: 50 },
    { east: 100, north: 50 },
    { east: 5100, north: -2950 },
    1 / 30,
  );
  assert.ok(closeTo(centre.east, 5100));
  assert.ok(closeTo(centre.north, -2950));
});

test('an off-centre moving target keeps the same decaying offset', () => {
  const moved = { east: 5000, north: 3000 };
  const centre = followedCentre(
    { east: 100, north: 50 },
    origin,
    moved,
    FOLLOW_HALF_LIFE_SECONDS,
  );
  assert.ok(closeTo(centre.east, 5050));
  assert.ok(closeTo(centre.north, 3025));
});

test('the approach does not depend on how the time is cut into frames', () => {
  const inOneFrame = followedCentre(
    { east: 100, north: 50 },
    origin,
    origin,
    0.3,
  );
  const inThreeFrames = [0.1, 0.1, 0.1].reduce(
    (centre, deltaSeconds) =>
      followedCentre(centre, origin, origin, deltaSeconds),
    { east: 100, north: 50 },
  );
  assert.ok(closeTo(inOneFrame.east, inThreeFrames.east));
  assert.ok(closeTo(inOneFrame.north, inThreeFrames.north));
});
