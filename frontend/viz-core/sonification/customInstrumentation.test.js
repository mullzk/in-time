import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  CUSTOM_INSTRUMENTATION_NAME,
  CustomInstrumentationStore,
  instrumentationFromText,
  seedTextFrom,
} from './customInstrumentation.js';
import { INSTRUMENTATIONS } from './presets.js';

const MARIMBA_TEXT = '{ "instrumentation": "Probe", "sound": "marimba" }';

const storageDouble = () => {
  const entries = new Map();
  return {
    getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => entries.set(key, value),
    removeItem: (key) => entries.delete(key),
  };
};

test('a valid document becomes an instrumentation under its own name', () => {
  const { instrumentation, error } = instrumentationFromText(MARIMBA_TEXT);

  assert.equal(error, undefined);
  assert.equal(instrumentation.name, 'Probe');
});

test('text that is not JSON is reported, not thrown', () => {
  const { instrumentation, error } = instrumentationFromText('{ "sound": ');

  assert.equal(instrumentation, undefined);
  assert.match(error, /JSON/);
});

test('a document that is not an object is reported', () => {
  assert.match(instrumentationFromText('null').error, /Dokument/);
  assert.match(instrumentationFromText('[1, 2]').error, /Dokument/);
});

test('a document error keeps the message that names its place', () => {
  const { error } = instrumentationFromText(
    '{ "instrumentation": "Probe", "sound": "marimba", "tram": { "sound": "tuba" } }',
  );

  assert.match(error, /tuba/);
  assert.match(error, /tram/);
});

test('the store hands back what was written to it', () => {
  const store = new CustomInstrumentationStore(storageDouble());

  store.write(MARIMBA_TEXT);

  assert.equal(store.readText(), MARIMBA_TEXT);
  assert.equal(store.read().name, 'Probe');
});

test('an empty store has no instrumentation', () => {
  const store = new CustomInstrumentationStore(storageDouble());

  assert.equal(store.readText(), null);
  assert.equal(store.read(), null);
});

test('a faulty text is refused and leaves the stored one in place', () => {
  const store = new CustomInstrumentationStore(storageDouble());
  store.write(MARIMBA_TEXT);

  const { error } = store.write('{ "instrumentation": "Kaputt" }');

  assert.match(error, /Sound/);
  assert.equal(store.readText(), MARIMBA_TEXT);
});

test('a cleared store starts over from nothing', () => {
  const store = new CustomInstrumentationStore(storageDouble());
  store.write(MARIMBA_TEXT);

  store.clear();

  assert.equal(store.readText(), null);
  assert.equal(store.read(), null);
});

test('every delivered instrumentation serves as a template', () => {
  INSTRUMENTATIONS.forEach((instrumentation) => {
    const { instrumentation: seeded, error } = instrumentationFromText(
      seedTextFrom(instrumentation.document),
    );

    assert.equal(error, undefined, `${instrumentation.name}: ${error}`);
    assert.equal(seeded.name, CUSTOM_INSTRUMENTATION_NAME);
  });
});

test('a template seeded twice keeps the one name', () => {
  const once = seedTextFrom(INSTRUMENTATIONS[0].document);
  const twice = seedTextFrom(JSON.parse(once));

  assert.equal(twice, once);
});
