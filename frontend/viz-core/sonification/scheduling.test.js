import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  cursorAtOrAfter,
  DENSITY_DAMPING_VOICES,
  dropPriorityOf,
  eventsInLookahead,
  gainDampingForDensity,
  groupOf,
  MAXIMUM_VOICES_PER_WINDOW,
  MINIMUM_GROUP_GAP_SECONDS,
  passesGroupGap,
  passesMuteFilter,
  passesVoiceBudget,
  TRANSPORT_GROUPS,
} from './scheduling.js';

test('groupOf splits rail into long-distance, InterRegio and regional', () => {
  assert.equal(groupOf(0), 'fernverkehr');
  assert.equal(groupOf(1), 'interregio');
  assert.equal(groupOf(2), 'regionalverkehr');
  assert.equal(groupOf(3), 'regionalverkehr');
  assert.equal(groupOf(4), 'regionalverkehr');
  assert.equal(groupOf(5), 'tram');
  assert.equal(groupOf(6), 'bus');
});

test('groupOf falls back to regional rail for an unknown category', () => {
  assert.equal(groupOf(99), 'regionalverkehr');
});

test('dropPriorityOf ranks Fernverkehr first and Bus last', () => {
  assert.deepEqual(TRANSPORT_GROUPS, [
    'fernverkehr',
    'interregio',
    'regionalverkehr',
    'tram',
    'bus',
  ]);
  assert.equal(dropPriorityOf('fernverkehr'), 0);
  assert.equal(dropPriorityOf('bus'), 4);
});

test('passesMuteFilter drops a hidden group only', () => {
  assert.equal(passesMuteFilter('tram', ['bus']), true);
  assert.equal(passesMuteFilter('bus', ['bus']), false);
  assert.equal(passesMuteFilter('bus', []), true);
});

test('passesGroupGap allows the first sound of a group', () => {
  assert.equal(passesGroupGap(10, undefined, MINIMUM_GROUP_GAP_SECONDS), true);
});

test('passesGroupGap drops a sound closer than the minimum gap', () => {
  assert.equal(passesGroupGap(10.02, 10, 0.04), false);
  assert.equal(passesGroupGap(10.5, 10, 0.04), true);
});

test('passesVoiceBudget keeps the top-priority group even when full', () => {
  assert.equal(
    passesVoiceBudget(MAXIMUM_VOICES_PER_WINDOW, MAXIMUM_VOICES_PER_WINDOW, 0),
    true,
  );
  assert.equal(
    passesVoiceBudget(MAXIMUM_VOICES_PER_WINDOW, MAXIMUM_VOICES_PER_WINDOW, 1),
    false,
  );
});

test('passesVoiceBudget keeps any group below the budget', () => {
  assert.equal(passesVoiceBudget(5, 24, 3), true);
  assert.equal(passesVoiceBudget(23, 24, 2), true);
});

test('gainDampingForDensity is full below the damping threshold', () => {
  assert.equal(gainDampingForDensity(0, DENSITY_DAMPING_VOICES), 1);
  assert.equal(
    gainDampingForDensity(DENSITY_DAMPING_VOICES, DENSITY_DAMPING_VOICES),
    1,
  );
});

test('gainDampingForDensity quietens proportionally above the threshold', () => {
  assert.equal(gainDampingForDensity(16, 8), 0.5);
  assert.equal(gainDampingForDensity(32, 8), 0.25);
});

test('cursorAtOrAfter finds the first event at or after a time', () => {
  const events = [{ time: 10 }, { time: 20 }, { time: 30 }];
  assert.equal(cursorAtOrAfter(events, 5), 0);
  assert.equal(cursorAtOrAfter(events, 20), 1);
  assert.equal(cursorAtOrAfter(events, 25), 2);
  assert.equal(cursorAtOrAfter(events, 100), 3);
});

test('eventsInLookahead collects events up to the horizon and advances', () => {
  const events = [{ time: 10 }, { time: 20 }, { time: 30 }, { time: 40 }];
  const first = eventsInLookahead(events, 0, 25);
  assert.deepEqual(
    first.due.map((event) => event.time),
    [10, 20],
  );
  assert.equal(first.cursor, 2);
  const second = eventsInLookahead(events, first.cursor, 45);
  assert.deepEqual(
    second.due.map((event) => event.time),
    [30, 40],
  );
  assert.equal(second.cursor, 4);
});

test('eventsInLookahead returns nothing when the horizon precedes the cursor', () => {
  const events = [{ time: 10 }, { time: 20 }];
  const result = eventsInLookahead(events, 0, 5);
  assert.deepEqual(result.due, []);
  assert.equal(result.cursor, 0);
});
