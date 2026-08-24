import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatTimeOfDay } from './timeOfDay.js';

test('a time of day is told on the clock', () => {
  assert.equal(formatTimeOfDay(8 * 3_600), '08:00');
  assert.equal(formatTimeOfDay(14 * 3_600 + 7 * 60 + 45), '14:07');
  assert.equal(
    formatTimeOfDay(25 * 3_600 + 30 * 60),
    '01:30',
    'past midnight the operating day carries on, the clock does not',
  );
});
