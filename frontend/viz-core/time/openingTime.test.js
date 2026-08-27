import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  departureToOpenOn,
  playbackToOpenOn,
  secondsOfDayInZurich,
} from './openingTime.js';

const at = (hours, minutes = 0) => hours * 3600 + minutes * 60;

const TAKT_WINDOW = { leadSeconds: at(0, 10) };

test('the wall clock is read in Zurich, not where the browser stands', () => {
  assert.equal(
    secondsOfDayInZurich(new Date('2026-08-24T08:50:00Z')),
    at(10, 50),
    'summer time is two hours ahead of UTC',
  );
  assert.equal(
    secondsOfDayInZurich(new Date('2026-01-15T08:50:00Z')),
    at(9, 50),
    'winter time is one',
  );
});

test('one sets off at the hour one is looking', () => {
  assert.equal(departureToOpenOn(at(10, 50)), at(10, 50));
  assert.equal(departureToOpenOn(at(19, 55)), at(19, 55));
});

test('the evening is shown the morning instead', () => {
  assert.equal(departureToOpenOn(at(20)), at(7));
  assert.equal(departureToOpenOn(at(23, 30)), at(7));
});

test('so are the small hours, up to the hour the country starts', () => {
  assert.equal(departureToOpenOn(at(0, 5)), at(7));
  assert.equal(departureToOpenOn(at(5, 59)), at(7));
  assert.equal(departureToOpenOn(at(6)), at(6));
});

test('playback opens a little before the hour one is looking', () => {
  assert.equal(playbackToOpenOn(at(10, 50), TAKT_WINDOW), at(10, 40));
});

test('playback is shown the morning by the same hours', () => {
  assert.equal(playbackToOpenOn(at(20), TAKT_WINDOW), at(6, 50));
  assert.equal(playbackToOpenOn(at(23, 30), TAKT_WINDOW), at(6, 50));
  assert.equal(playbackToOpenOn(at(3, 5), TAKT_WINDOW), at(6, 50));
});

test('playback never opens before the service day is cut', () => {
  assert.equal(
    playbackToOpenOn(at(6), TAKT_WINDOW),
    at(5, 50),
    'the earliest opening there is still lies well after the pre-dawn cut',
  );
});

test('a departure stands where its slider can stand', () => {
  assert.equal(departureToOpenOn(at(10, 53)) % 300, 0);
  assert.equal(departureToOpenOn(at(10, 53)), at(10, 50));
});
