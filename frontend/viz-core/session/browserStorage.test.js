import assert from 'node:assert/strict';
import { test } from 'node:test';
import { localStorageOrForgetful } from './browserStorage.js';

const workingStorage = () => {
  const entries = new Map();
  return {
    getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => entries.set(key, value),
    removeItem: (key) => entries.delete(key),
    size: () => entries.size,
  };
};

const throwing = () => {
  throw new Error('storage is disabled');
};

test('a storage that works is the one handed back', () => {
  const storage = workingStorage();

  assert.equal(
    localStorageOrForgetful(() => storage),
    storage,
  );
});

test('the trial leaves nothing behind', () => {
  const storage = workingStorage();

  localStorageOrForgetful(() => storage);

  assert.equal(storage.size(), 0);
});

test('a storage that cannot be reached is replaced by one that forgets', () => {
  const storage = localStorageOrForgetful(throwing);

  storage.setItem('key', 'value');

  assert.equal(storage.getItem('key'), null);
});

test('a storage that refuses to write is replaced by one that forgets', () => {
  const refusing = { ...workingStorage(), setItem: throwing };

  const storage = localStorageOrForgetful(() => refusing);

  storage.setItem('key', 'value');
  assert.equal(storage.getItem('key'), null);
});

test('without a browser around, nothing is stored and nothing throws', () => {
  const storage = localStorageOrForgetful();

  storage.setItem('key', 'value');

  assert.equal(storage.getItem('key'), null);
});
