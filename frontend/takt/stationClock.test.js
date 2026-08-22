import assert from 'node:assert/strict';
import { test } from 'node:test';
import { centreOfClock, handTurns, nightAmount } from './stationClock.js';

const at = (hours, minutes = 0) => hours * 3600 + minutes * 60;

const closeTo = (actual, expected) =>
  assert.ok(
    Math.abs(actual - expected) < 1e-9,
    `expected ${actual} to be ${expected}`,
  );

const JUNE = '2026-06-15';
const DECEMBER = '2026-12-15';

test('the hands stand where the hour and the minute are', () => {
  assert.equal(handTurns(at(9)).hour, 0.75);
  assert.equal(handTurns(at(9)).minute, 0);
  assert.equal(handTurns(at(3, 30)).minute, 0.5);
  assert.equal(handTurns(at(3, 30)).hour, 3.5 / 12);
});

test('the minute hand moves within the minute rather than stepping', () => {
  const halfPast = handTurns(at(12, 30)).minute;
  const halfPastAndAHalf = handTurns(at(12, 30) + 30).minute;

  assert.ok(halfPastAndAHalf > halfPast);
  closeTo(halfPastAndAHalf - halfPast, 0.5 / 60);
});

// A service day runs past midnight, so the panel hands out times beyond 24 h.
test('an hour past midnight reads as that hour on the dial', () => {
  closeTo(handTurns(at(25)).hour, handTurns(at(1)).hour);
  closeTo(handTurns(at(26, 20)).minute, handTurns(at(2, 20)).minute);
});

test('midday is day and the small hours are night', () => {
  assert.equal(nightAmount(at(12), JUNE), 0);
  assert.equal(nightAmount(at(3), JUNE), 1);
  assert.equal(nightAmount(at(26), JUNE), 1);
});

test('the night falls at the sunset of that month', () => {
  // June sets at 21:25, December at 16:36.
  assert.equal(nightAmount(at(17, 30), JUNE), 0);
  assert.equal(nightAmount(at(17, 30), DECEMBER), 1);
});

// June sets at 21:25, and the palette needs the half hour after that to arrive
// at its night; in between it stands part way.
test('dusk is faded across, not switched', () => {
  assert.equal(nightAmount(at(21, 20), JUNE), 0);
  assert.equal(nightAmount(at(21, 56), JUNE), 1);

  const midDusk = nightAmount(at(21, 40), JUNE);
  assert.ok(midDusk > 0.4 && midDusk < 0.6, `mid-dusk stood at ${midDusk}`);
});

test('the clock hangs in the top right corner', () => {
  const { x, y, radius } = centreOfClock(1200, 800);

  assert.equal(x + radius + 12, 1200);
  assert.equal(y - radius, 12);
});

// The station search fills a narrow top bar edge to edge, so the clock cannot
// share that row with it.
test('on a narrow canvas the clock drops below the top bar', () => {
  const wide = centreOfClock(800, 800);
  const narrow = centreOfClock(400, 800);

  assert.ok(narrow.y - narrow.radius > wide.y - wide.radius);
});

test('the dial keeps a sane size on any canvas', () => {
  assert.equal(centreOfClock(4000, 3000).radius, 52);
  assert.equal(centreOfClock(320, 200).radius, 28);
});
