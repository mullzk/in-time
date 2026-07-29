import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildInfoContent } from './infoContent.js';

const shortcutKeys = (content) =>
  content.shortcuts.map((shortcut) => shortcut.keys);

test('the station-search shortcut appears only when the panel offers it', () => {
  assert.ok(
    shortcutKeys(buildInfoContent({ stationSearch: true })).includes('G'),
  );
  assert.ok(
    !shortcutKeys(buildInfoContent({ stationSearch: false })).includes('G'),
  );
});

test('every shortcut carries a key and a description', () => {
  const { shortcuts } = buildInfoContent({ stationSearch: true });
  shortcuts.forEach(({ keys, description }) => {
    assert.ok(keys.length > 0);
    assert.ok(description.length > 0);
  });
});
