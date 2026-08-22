import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DEFAULT_TEMPO,
  MAX_TEMPO,
  MIN_TEMPO,
  SECONDS_PER_DAY,
  TimeModel,
} from './timeModel.js';

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

test('every explicit seek bumps the seek generation', () => {
  const time = new TimeModel(1000, 2000);
  assert.equal(time.seekGeneration, 0);
  time.seekToPosition(0.25);
  assert.equal(time.seekGeneration, 1);
  time.seekToTime(1500);
  assert.equal(time.seekGeneration, 2);
  time.advance(0.1);
  assert.equal(time.seekGeneration, 2);
});

test('an operating window running past midnight is preserved', () => {
  const time = new TimeModel(18_000, 93_600);
  assert.equal(time.rangeEnd, 93_600);
  time.seekToPosition(1);
  assert.equal(time.current, 93_600);
});

test('a new range starts the clock at its beginning', () => {
  const time = new TimeModel(0, SECONDS_PER_DAY);
  time.seekToTime(12 * 3600);

  time.setRange(8 * 3600, 10 * 3600);

  assert.equal(time.current, 8 * 3600);
  assert.equal(time.scrubberPosition(), 0);
});

test('a clock in a new range runs to its end and begins again', () => {
  const time = new TimeModel(0, SECONDS_PER_DAY);
  time.setRange(8 * 3600, 10 * 3600);
  time.setTempo(MAX_TEMPO);
  time.play();

  time.advance(4);

  assert.equal(time.current, 8 * 3600 + 4 * MAX_TEMPO);

  time.advance(5);

  assert.equal(
    time.current,
    8 * 3600 + (9 * MAX_TEMPO - 2 * 3600),
    'past the end it starts over',
  );
});

test('a clock that does not repeat stops at the end of its range', () => {
  const time = new TimeModel(8 * 3600, 10 * 3600, { repeats: false });
  time.setTempo(MAX_TEMPO);
  time.play();

  time.advance(4);

  assert.equal(time.current, 8 * 3600 + 4 * MAX_TEMPO, 'still under way');

  time.advance(60);

  assert.equal(time.current, 10 * 3600, 'and comes to rest at the end');
  assert.equal(time.playing, false);
});

const clockAtItsEnd = () => {
  const time = new TimeModel(8 * 3600, 10 * 3600, { repeats: false });
  time.setTempo(MAX_TEMPO);
  time.play();
  time.advance(3600);
  return time;
};

test('a clock played again after it ran out starts over', () => {
  const time = clockAtItsEnd();

  time.play();

  assert.equal(time.current, 8 * 3600, 'back at the beginning');
  assert.equal(time.playing, true);
});

test('the same holds when it is played by the toggle', () => {
  const time = clockAtItsEnd();

  time.togglePlay();

  assert.equal(time.current, 8 * 3600);
  assert.equal(time.playing, true);
});

test('a spread that reaches nowhere stands at the start of its scrubber', () => {
  const time = new TimeModel(8 * 3600, 8 * 3600, { repeats: false });

  assert.equal(time.scrubberPosition(), 0);
});

test('a clock paused halfway carries on where it stood', () => {
  const time = new TimeModel(8 * 3600, 10 * 3600, { repeats: false });
  time.setTempo(MAX_TEMPO);
  time.play();
  time.advance(4);
  time.pause();

  time.play();

  assert.equal(time.current, 8 * 3600 + 4 * MAX_TEMPO, 'nothing was rewound');
});

test('a spread gaining vehicles keeps the clock where it stood', () => {
  const time = new TimeModel(7 * 3600, 8 * 3600, { repeats: false });
  time.seekToTime(7 * 3600 + 12 * 60);

  time.setRangeKeepingTime(7 * 3600, 9 * 3600);

  assert.equal(time.current, 7 * 3600 + 12 * 60);
  assert.equal(time.rangeEnd, 9 * 3600);
});
