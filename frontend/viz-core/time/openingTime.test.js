import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  departureToOpenOn,
  playbackToOpenOn,
  secondsOfDayInZurich,
} from './openingTime.js';

const at = (hours, minutes = 0) => hours * 3600 + minutes * 60;

const TAKT_WINDOW = { leadSeconds: at(0, 10), dayCutSeconds: at(3) };

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

test('playback opens a little before the hour one is looking', () => {
  assert.equal(playbackToOpenOn(at(10, 50), TAKT_WINDOW), at(10, 40));
});

test('the minutes before the cut belong to the end of the service day', () => {
  assert.equal(
    playbackToOpenOn(at(3, 5), TAKT_WINDOW),
    at(2, 55) + 24 * 3600,
    'ten minutes before three is the small hours of the day that ends there',
  );
});

test('the first minutes of a calendar day are the day before', () => {
  assert.equal(playbackToOpenOn(at(0, 5), TAKT_WINDOW), at(23, 55));
});

test('a departure stands where its slider can stand', () => {
  assert.equal(departureToOpenOn(at(10, 53)) % 300, 0);
  assert.equal(departureToOpenOn(at(10, 53)), at(10, 50));
});
