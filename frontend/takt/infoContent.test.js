import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildInfoContent } from './infoContent.js';

test('every intro link carries a label and an absolute href', () => {
  const { intro } = buildInfoContent();
  const links = intro.flat().filter((part) => typeof part !== 'string');
  assert.ok(links.length > 0);
  links.forEach(({ label, href }) => {
    assert.ok(label.length > 0);
    assert.ok(href.startsWith('https://'));
  });
});

test('the key that switches to the colour-blind scheme is listed', () => {
  const { shortcuts } = buildInfoContent();
  assert.ok(shortcuts.some(({ keys }) => keys === 'C'));
});

test('every shortcut carries a key and a description', () => {
  const { shortcuts } = buildInfoContent();
  shortcuts.forEach(({ keys, description }) => {
    assert.ok(keys.length > 0);
    assert.ok(description.length > 0);
  });
});
