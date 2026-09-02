import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  formatDuration,
  formatRideWithWait,
  formatTravelTimeFrom,
} from './labels.js';

test('minutes stay minutes while they read as minutes', () => {
  assert.equal(formatDuration(58 * 60), '58 min');
  assert.equal(formatDuration(59 * 60 + 20), '59 min');
});

test('an hour and beyond is told in hours and minutes', () => {
  assert.equal(formatDuration(3_600), '1 h');
  assert.equal(formatDuration(3_600 + 12 * 60), '1 h 12 min');
  assert.equal(formatDuration(2 * 3_600 + 60), '2 h 1 min');
});

test('a journey shorter than a minute is still called a minute', () => {
  assert.equal(formatDuration(20), '1 min');
});

test('a travel time names where it was counted from', () => {
  assert.equal(formatTravelTimeFrom(21 * 60, 'Anfang'), '21 min ab Anfang');
});

test('a ride carries the wait it cost', () => {
  assert.equal(
    formatRideWithWait(10 * 60, 4 * 60),
    '10 min (+4 min Wartezeit)',
  );
  assert.equal(
    formatRideWithWait(10 * 60, 418 * 60),
    '10 min (+6 h 58 min Wartezeit)',
    'a wait long enough to read as hours is told in hours',
  );
});

test('a ride nobody waited for says nothing about waiting', () => {
  assert.equal(formatRideWithWait(10 * 60, 0), '10 min');
  assert.equal(formatRideWithWait(10 * 60, 59), '10 min');
});
