import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EASING_TIME_CONSTANT_SECONDS, EasedCounts } from './easedCounts.js';

const closeTo = (actual, expected) =>
  assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} ≠ ${expected}`);

test('the first counts are taken as they are, so a hub opens at its size', () => {
  const eased = new EasedCounts();
  assert.deepEqual(eased.easeTowards({ core: 4, ring: 0 }, 0.03), {
    core: 4,
    ring: 0,
  });
});

test('a change is followed half-way after ln 2 time constants of wall-clock time', () => {
  const eased = new EasedCounts();
  eased.easeTowards({ core: 0 }, 0);
  const halfWay = eased.easeTowards(
    { core: 10 },
    Math.LN2 * EASING_TIME_CONSTANT_SECONDS,
  );
  closeTo(halfWay.core, 5);
});

test('many short frames arrive where one long frame of the same time does', () => {
  const inSteps = new EasedCounts();
  const atOnce = new EasedCounts();
  inSteps.easeTowards({ core: 0 }, 0);
  atOnce.easeTowards({ core: 0 }, 0);
  Array.from({ length: 30 }).forEach(() => {
    inSteps.easeTowards({ core: 6 }, 1 / 30);
  });
  closeTo(
    inSteps.easeTowards({ core: 6 }, 0).core,
    atOnce.easeTowards({ core: 6 }, 1).core,
  );
});

test('the eased counts never overshoot and never fall below zero', () => {
  const eased = new EasedCounts();
  eased.easeTowards({ core: 3 }, 0);
  const falling = eased.easeTowards({ core: 0 }, 10);
  assert.ok(falling.core >= 0 && falling.core < 3);
  const rising = eased.easeTowards({ core: 8 }, 10);
  assert.ok(rising.core <= 8 && rising.core > 0);
});
