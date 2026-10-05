import assert from 'node:assert/strict';
import { test } from 'node:test';
import { clockHandAngles } from './stationClock.js';

const at = (hours, minutes, seconds = 0) =>
  hours * 3600 + minutes * 60 + seconds;

test('at half past eleven the minute hand points down, the hour hand just short of twelve', () => {
  assert.deepEqual(clockHandAngles(at(11, 30)), {
    minuteDegrees: 180,
    hourDegrees: 345,
  });
});

test('both hands sweep through the minute instead of jumping', () => {
  const { minuteDegrees, hourDegrees } = clockHandAngles(at(13, 15, 30));
  assert.equal(minuteDegrees, 93);
  assert.equal(hourDegrees, 37.75);
});

test('the dial shows twelve hours, and the operating day runs past midnight', () => {
  assert.deepEqual(clockHandAngles(at(24, 45)), clockHandAngles(at(0, 45)));
  assert.deepEqual(clockHandAngles(at(15, 0)), clockHandAngles(at(3, 0)));
});
