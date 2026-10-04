import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  PULS_ARRIVAL_COLOR,
  PULS_DEPARTURE_COLOR,
  taktPhaseColor,
} from './taktPhase.js';

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

// Read as a distance between colours rather than per channel, so the phases
// stay under test when their colours are reworked.
const distanceBetween = (first, second) =>
  Math.hypot(...first.map((channel, index) => channel - second[index]));

test('each phase runs from its own colour towards the neutral one', () => {
  const departurePhase = (seconds) =>
    distanceBetween(taktPhaseColor(NEUTRAL, seconds), PULS_DEPARTURE_COLOR);
  assert.equal(departurePhase(FULL_HOUR), 0);
  assert.ok(departurePhase(FULL_HOUR + 7.5 * 60) > 0);
  assert.ok(
    departurePhase(QUARTER_PAST) > departurePhase(FULL_HOUR + 7.5 * 60),
  );

  const arrivalPhase = (seconds) =>
    distanceBetween(taktPhaseColor(NEUTRAL, seconds), PULS_ARRIVAL_COLOR);
  assert.ok(
    arrivalPhase(HALF_PAST - 1) < arrivalPhase(QUARTER_PAST + 7.5 * 60),
  );
  assert.ok(arrivalPhase(QUARTER_PAST + 7.5 * 60) < arrivalPhase(QUARTER_PAST));
});

test('the colour repeats with every half hour of the day', () => {
  assert.deepEqual(
    taktPhaseColor(NEUTRAL, FULL_HOUR + 4 * 60),
    taktPhaseColor(NEUTRAL, FULL_HOUR + 34 * 60),
  );
});
