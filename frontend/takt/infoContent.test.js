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

test('every intro link carries a label and an absolute href', () => {
  const { intro } = buildInfoContent({ stationSearch: true });
  const links = intro.flat().filter((part) => typeof part !== 'string');
  assert.ok(links.length > 0);
  links.forEach(({ label, href }) => {
    assert.ok(label.length > 0);
    assert.ok(href.startsWith('https://'));
  });
});

test('every shortcut carries a key and a description', () => {
  const { shortcuts } = buildInfoContent({ stationSearch: true });
  shortcuts.forEach(({ keys, description }) => {
    assert.ok(keys.length > 0);
    assert.ok(description.length > 0);
  });
});
