import assert from 'node:assert/strict';
import { test } from 'node:test';
import { WelcomeVisit } from './welcomeVisit.js';

const DAY_IN_MILLIS = 24 * 60 * 60 * 1000;
const YEAR_IN_MILLIS = 365 * DAY_IN_MILLIS;

const storageHolding = (entries = new Map()) => ({
  getItem: (key) => entries.get(key) ?? null,
  setItem: (key, value) => entries.set(key, value),
  removeItem: (key) => entries.delete(key),
});

const visitAt = (millis, storage) => new WelcomeVisit(storage, () => millis);

test('a first visit is due the welcome', () => {
  assert.equal(visitAt(0, storageHolding()).isDue(), true);
});

test('the visit that dismissed it is not due it again', () => {
  const storage = storageHolding();
  visitAt(YEAR_IN_MILLIS, storage).recordDismissal();

  assert.equal(visitAt(YEAR_IN_MILLIS, storage).isDue(), false);
});

test('a return within two years is not due it', () => {
  const storage = storageHolding();
  visitAt(0, storage).recordDismissal();

  assert.equal(
    visitAt(2 * YEAR_IN_MILLIS - DAY_IN_MILLIS, storage).isDue(),
    false,
  );
});

test('a return after two years is due it afresh', () => {
  const storage = storageHolding();
  visitAt(0, storage).recordDismissal();

  assert.equal(
    visitAt(2 * YEAR_IN_MILLIS + DAY_IN_MILLIS, storage).isDue(),
    true,
  );
});

test('a mark lying ahead of the clock counts for nothing', () => {
  const storage = storageHolding();
  visitAt(2 * YEAR_IN_MILLIS, storage).recordDismissal();

  assert.equal(visitAt(YEAR_IN_MILLIS, storage).isDue(), true);
});

test('a mark that is not a time counts for nothing', () => {
  const storage = storageHolding(
    new Map([['in-time.welcome-dismissed-at', 'gestern']]),
  );

  assert.equal(visitAt(YEAR_IN_MILLIS, storage).isDue(), true);
});

test('a storage that forgets leaves every visit a first one', () => {
  const forgetful = {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
  };
  const visit = visitAt(YEAR_IN_MILLIS, forgetful);
  visit.recordDismissal();

  assert.equal(visit.isDue(), true);
});
