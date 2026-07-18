import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULT_TEMPO, MAX_TEMPO, MIN_TEMPO, TimeModel } from './timeModel.js';

test('a paused model does not advance', () => {
  const time = new TimeModel(1000, 2000);
  time.advance(5);
  assert.equal(time.current, 1000);
});

test('advancing moves current by tempo * realDelta while playing', () => {
  const time = new TimeModel(1000, 2000);
  time.setTempo(120);
  time.play();
  time.advance(2);
  assert.equal(time.current, 1240);
});

test('playback loops back over the operating window', () => {
  const time = new TimeModel(1000, 2000);
  time.setTempo(60);
  time.play();
  time.current = 1990;
  time.advance(1);
  assert.equal(time.current, 1050);
});

test('tempo is clamped and defaults to 240', () => {
  const time = new TimeModel(1000, 2000);
  assert.equal(time.tempo, DEFAULT_TEMPO);
  time.setTempo(10);
  assert.equal(time.tempo, MIN_TEMPO);
  time.setTempo(9000);
  assert.equal(time.tempo, MAX_TEMPO);
});

test('the scrubber maps the operating window onto [0, 1]', () => {
  const time = new TimeModel(1000, 2000);
  time.current = 1000;
  assert.equal(time.scrubberPosition(), 0);
  time.current = 2000;
  assert.equal(time.scrubberPosition(), 1);
  time.seekToPosition(0.25);
  assert.equal(time.current, 1250);
});

test('seekToTime sets current and clamps to the window', () => {
  const time = new TimeModel(10_800, 97_200);
  time.seekToTime(14_400);
  assert.equal(time.current, 14_400);
  time.seekToTime(200_000);
  assert.equal(time.current, 97_200);
});

test('an operating window running past midnight is preserved', () => {
  const time = new TimeModel(18_000, 93_600);
  assert.equal(time.rangeEnd, 93_600);
  time.seekToPosition(1);
  assert.equal(time.current, 93_600);
});
