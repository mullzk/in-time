import assert from 'node:assert/strict';
import { test } from 'node:test';
import { StoppedClock } from './stoppedClock.js';

test('a stopped clock tells the time it was set to', () => {
  assert.equal(new StoppedClock(8 * 3600).current, 28_800);
});

test('advancing a stopped clock leaves it where it is', () => {
  const clock = new StoppedClock(8 * 3600);

  clock.advance(1.5);
  clock.advance(600);

  assert.equal(clock.current, 28_800);
});

test('a stopped clock cannot be started', () => {
  const clock = new StoppedClock(8 * 3600);

  clock.play();
  clock.togglePlay();

  assert.equal(clock.playing, false);
  assert.equal(clock.current, 28_800);
});

test('seeking a stopped clock moves nothing', () => {
  const clock = new StoppedClock(8 * 3600);

  clock.seekToTime(12 * 3600);
  clock.seekToPosition(0.5);

  assert.equal(clock.current, 28_800);
  assert.equal(clock.seekGeneration, 0);
});
