import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  ARRIVING,
  DEPARTING,
  hubPhaseColor,
  PULS_HUB_ARRIVAL_COLOR,
  PULS_HUB_DEPARTURE_COLOR,
  PULS_TRAIN_ARRIVAL_COLOR,
  PULS_TRAIN_DEPARTURE_COLOR,
  phaseOfTheHalfHour,
  trainPhaseColor,
} from './taktPhase.js';

const NEUTRAL = [100, 100, 100];
const FULL_HOUR = 12 * 3600;
const QUARTER_PAST = FULL_HOUR + 15 * 60;
const HALF_PAST = FULL_HOUR + 30 * 60;

// Read as a distance between colours rather than per channel, so the phases
// stay under test when their colours are reworked.
const distanceBetween = (first, second) =>
  Math.hypot(...first.map((channel, index) => channel - second[index]));

const PHASES = [
  {
    name: 'the trains',
    color: trainPhaseColor,
    departure: PULS_TRAIN_DEPARTURE_COLOR,
    arrival: PULS_TRAIN_ARRIVAL_COLOR,
  },
  {
    name: 'the hubs',
    color: hubPhaseColor,
    departure: PULS_HUB_DEPARTURE_COLOR,
    arrival: PULS_HUB_ARRIVAL_COLOR,
  },
];

PHASES.forEach(({ name, color, departure, arrival }) => {
  test(`${name}: the element keeps its own colour at the quarter, where the phases meet`, () => {
    assert.deepEqual(color(NEUTRAL, QUARTER_PAST), NEUTRAL);
    assert.deepEqual(color(NEUTRAL, QUARTER_PAST + 30 * 60), NEUTRAL);
  });

  test(`${name}: the departure phase opens the half hour, the arrival phase closes it`, () => {
    const opening = color(NEUTRAL, FULL_HOUR);
    assert.notDeepEqual(opening, color(NEUTRAL, HALF_PAST - 1));
    assert.deepEqual(color(NEUTRAL, HALF_PAST), opening);
  });

  test(`${name}: each phase runs from its own colour towards the neutral one`, () => {
    const departurePhase = (seconds) =>
      distanceBetween(color(NEUTRAL, seconds), departure);
    assert.equal(departurePhase(FULL_HOUR), 0);
    assert.ok(departurePhase(FULL_HOUR + 7.5 * 60) > 0);
    assert.ok(
      departurePhase(QUARTER_PAST) > departurePhase(FULL_HOUR + 7.5 * 60),
    );

    const arrivalPhase = (seconds) =>
      distanceBetween(color(NEUTRAL, seconds), arrival);
    assert.ok(
      arrivalPhase(HALF_PAST - 1) < arrivalPhase(QUARTER_PAST + 7.5 * 60),
    );
    assert.ok(
      arrivalPhase(QUARTER_PAST + 7.5 * 60) < arrivalPhase(QUARTER_PAST),
    );
  });

  test(`${name}: the colour holds over most of its quarter rather than washing out evenly`, () => {
    const wholeFade = distanceBetween(departure, NEUTRAL);
    const halfWayToTheQuarter = FULL_HOUR + 7.5 * 60;

    assert.ok(
      distanceBetween(color(NEUTRAL, halfWayToTheQuarter), departure) <
        wholeFade / 4,
      'still at least three quarters its own colour half way to the quarter',
    );
  });

  // Measured as the share of each phase's own way to the neutral colour: the
  // two phase colours do not sit the same distance from it.
  test(`${name}: both phases give up their colour at the same rate`, () => {
    const shareKept = (seconds, own) =>
      distanceBetween(color(NEUTRAL, seconds), NEUTRAL) /
      distanceBetween(own, NEUTRAL);

    [1, 5, 10, 14].forEach((minutes) => {
      assert.ok(
        Math.abs(
          shareKept(FULL_HOUR + minutes * 60, departure) -
            shareKept(HALF_PAST - minutes * 60, arrival),
        ) < 1e-9,
        `${minutes} min either side of the node minute`,
      );
    });
  });

  test(`${name}: the colour repeats with every half hour of the day`, () => {
    assert.deepEqual(
      color(NEUTRAL, FULL_HOUR + 4 * 60),
      color(NEUTRAL, FULL_HOUR + 34 * 60),
    );
  });
});

test('the half hour departs until the quarter and arrives from then on', () => {
  assert.equal(phaseOfTheHalfHour(FULL_HOUR), DEPARTING);
  assert.equal(phaseOfTheHalfHour(QUARTER_PAST - 1), DEPARTING);
  assert.equal(phaseOfTheHalfHour(QUARTER_PAST), ARRIVING);
  assert.equal(phaseOfTheHalfHour(HALF_PAST - 1), ARRIVING);
  assert.equal(phaseOfTheHalfHour(HALF_PAST), DEPARTING);
});

test('the trains are coloured more loudly than the hubs', () => {
  const vividness = ([red, green, blue]) =>
    Math.max(red, green, blue) - Math.min(red, green, blue);

  assert.ok(
    vividness(PULS_TRAIN_DEPARTURE_COLOR) > vividness(PULS_HUB_DEPARTURE_COLOR),
  );
  assert.ok(
    vividness(PULS_TRAIN_ARRIVAL_COLOR) > vividness(PULS_HUB_ARRIVAL_COLOR),
  );
});
