import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatDuration, formatWait } from './labels.js';

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

test('a wait is named, and its absence too', () => {
  assert.equal(formatWait(0), 'ohne Wartezeit');
  assert.equal(formatWait(59), 'ohne Wartezeit');
  assert.equal(formatWait(4 * 60), '4 min warten');
  assert.equal(
    formatWait(418 * 60),
    '6 h 58 min warten',
    'a wait long enough to read as hours is told in hours',
  );
});
