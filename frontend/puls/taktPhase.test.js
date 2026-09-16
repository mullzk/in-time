import assert from 'node:assert/strict';
import { test } from 'node:test';
import { taktPhaseColor } from './taktPhase.js';

const NEUTRAL = [100, 100, 100];
const FULL_HOUR = 12 * 3600;
const QUARTER_PAST = FULL_HOUR + 15 * 60;
const HALF_PAST = FULL_HOUR + 30 * 60;

test('the element keeps its own colour at the quarter, where the phases meet', () => {
  assert.deepEqual(taktPhaseColor(NEUTRAL, QUARTER_PAST), NEUTRAL);
  assert.deepEqual(taktPhaseColor(NEUTRAL, QUARTER_PAST + 30 * 60), NEUTRAL);
});

test('the departure phase opens the half hour, the arrival phase closes it', () => {
  const departure = taktPhaseColor(NEUTRAL, FULL_HOUR);
  const arrival = taktPhaseColor(NEUTRAL, HALF_PAST - 1);
  assert.notDeepEqual(departure, arrival);
  assert.deepEqual(taktPhaseColor(NEUTRAL, HALF_PAST), departure);
});

test('each phase runs from its own colour towards the neutral one', () => {
  const [, , departureBlue] = taktPhaseColor(NEUTRAL, FULL_HOUR);
  const [, , halfWayBlue] = taktPhaseColor(NEUTRAL, FULL_HOUR + 7.5 * 60);
  assert.ok(departureBlue > halfWayBlue);
  assert.ok(halfWayBlue > NEUTRAL[2]);
  const [arrivingRed] = taktPhaseColor(NEUTRAL, QUARTER_PAST + 7.5 * 60);
  const [arrivedRed] = taktPhaseColor(NEUTRAL, HALF_PAST - 1);
  assert.ok(arrivedRed > arrivingRed);
  assert.ok(arrivingRed > NEUTRAL[0]);
});

test('the colour repeats with every half hour of the day', () => {
  assert.deepEqual(
    taktPhaseColor(NEUTRAL, FULL_HOUR + 4 * 60),
    taktPhaseColor(NEUTRAL, FULL_HOUR + 34 * 60),
  );
});
