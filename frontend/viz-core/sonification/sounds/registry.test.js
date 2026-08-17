import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { test } from 'node:test';
import { KINDS } from './kinds.js';
import { allSounds, soundNamed } from './registry.js';

const vendorPath = (relative) =>
  new URL(`../../../vendor/${relative}`, import.meta.url);

test('every sound names a known kind and a base sound', () => {
  allSounds().forEach((sound) => {
    assert.ok(KINDS[sound.kind], `${sound.name} has kind ${sound.kind}`);
    assert.equal(typeof sound.base.s, 'string', `${sound.name} names a source`);
  });
});

test('a sound is found under its document name', () => {
  assert.equal(soundNamed('marimba').base.s, 'gm_marimba');
  assert.equal(soundNamed('bass-drum').base.s, 'bd');
  assert.equal(soundNamed('tuba'), null);
});

// The registry is what the vendoring script reads, so a sound the app offers is
// a sound it can actually play. This is the check that a missing drum bank slips
// past when the two lists are kept by hand.
test('every sound the registry offers has its asset vendored', () => {
  allSounds().forEach((sound) => {
    if (sound.asset === null) {
      return;
    }
    const relative =
      sound.asset.type === 'soundfont'
        ? `soundfonts/${sound.asset.file}.js`
        : `samples/uzu-drumkit/${sound.asset.bank}`;
    assert.ok(
      existsSync(vendorPath(relative)),
      `${sound.name} needs ${relative}`,
    );
  });
});
