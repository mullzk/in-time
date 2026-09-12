import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ColorSchemePreference } from './colorSchemePreference.js';

const storageHolding = (entries = new Map()) => ({
  getItem: (key) => entries.get(key) ?? null,
  setItem: (key, value) => entries.set(key, value),
  removeItem: (key) => entries.delete(key),
});

const FORGETFUL_STORAGE = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
};

test('a first visit sees the standard colours', () => {
  const preference = new ColorSchemePreference(storageHolding());

  assert.equal(preference.prefersColorBlindScheme(), false);
});

test('switching reports the scheme now in use', () => {
  const preference = new ColorSchemePreference(storageHolding());

  assert.equal(preference.toggle(), true);
  assert.equal(preference.prefersColorBlindScheme(), true);
  assert.equal(preference.toggle(), false);
  assert.equal(preference.prefersColorBlindScheme(), false);
});

test('the colour-blind scheme is kept for the next visit', () => {
  const storage = storageHolding();
  new ColorSchemePreference(storage).toggle();

  assert.equal(
    new ColorSchemePreference(storage).prefersColorBlindScheme(),
    true,
  );
});

test('switching back is kept for the next visit as well', () => {
  const storage = storageHolding();
  const preference = new ColorSchemePreference(storage);
  preference.toggle();
  preference.toggle();

  assert.equal(
    new ColorSchemePreference(storage).prefersColorBlindScheme(),
    false,
  );
});

test('a stored value that names no scheme counts as the standard one', () => {
  const storage = storageHolding(new Map([['in-time.color-scheme', 'grün']]));

  assert.equal(
    new ColorSchemePreference(storage).prefersColorBlindScheme(),
    false,
  );
});

test('a storage that forgets still switches back and forth within a visit', () => {
  const preference = new ColorSchemePreference(FORGETFUL_STORAGE);

  assert.equal(preference.toggle(), true);
  assert.equal(preference.toggle(), false);
});
