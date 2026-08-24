import assert from 'node:assert/strict';
import { test } from 'node:test';
import { downloadFileNameFor } from './instrumentationEditor.js';

test('the instrumentation name becomes the file name', () => {
  assert.equal(
    downloadFileNameFor('Eigene Vertonung'),
    'Eigene-Vertonung.json',
  );
});

test('umlauts survive, path characters do not', () => {
  assert.equal(downloadFileNameFor('Züri/Nacht'), 'Züri-Nacht.json');
  assert.equal(downloadFileNameFor('..'), 'eigene-vertonung.json');
});

test('the file name neither starts nor ends with a hyphen', () => {
  assert.equal(downloadFileNameFor('  Takt 30!  '), 'Takt-30.json');
});
