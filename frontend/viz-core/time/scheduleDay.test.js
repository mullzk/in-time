import assert from 'node:assert/strict';
import { test } from 'node:test';
import { clockOnTheLoopingDay } from './scheduleDay.js';
import { SECONDS_PER_DAY } from './timeModel.js';

const THREE_IN_THE_MORNING = 3 * 3600;

test('the window is a whole day, cut where almost nothing runs', () => {
  const time = clockOnTheLoopingDay();

  assert.equal(time.rangeStart, THREE_IN_THE_MORNING);
  assert.equal(time.rangeEnd - time.rangeStart, SECONDS_PER_DAY);
});

test('the day opens somewhere inside its own window, and waits there', () => {
  const time = clockOnTheLoopingDay();

  assert.ok(time.current >= time.rangeStart);
  assert.ok(time.current < time.rangeEnd);
  assert.equal(time.playing, false);
});

test('the window loops rather than running out', () => {
  const time = clockOnTheLoopingDay();
  time.seekToTime(time.rangeEnd);
  time.play();
  time.advance(1);

  assert.ok(time.current < time.rangeEnd);
  assert.equal(time.playing, true);
});
