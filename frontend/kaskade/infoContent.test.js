import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildInfoContent } from './infoContent.js';

test('the key that switches to the colour-blind scheme is listed', () => {
  const { shortcuts } = buildInfoContent();
  assert.ok(shortcuts.some(({ keys }) => keys === 'C'));
});
