import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Instrumentation } from './instrumentation.js';
import { INSTRUMENTATIONS } from './presets.js';
import { TRANSPORT_GROUPS } from './scheduling.js';

const namedSoundType = (name) => ({
  name,
  arrival() {},
  departure() {},
  passthrough() {},
  dwell() {
    return null;
  },
});

test('soundTypeFor returns the sound type mapped to a group', () => {
  const instrumentation = new Instrumentation({
    fernverkehr: namedSoundType('fv'),
    regionalverkehr: namedSoundType('rv'),
    tram: namedSoundType('tram'),
    bus: namedSoundType('bus'),
  });
  assert.equal(instrumentation.soundTypeFor('tram').name, 'tram');
  assert.equal(instrumentation.soundTypeFor('fernverkehr').name, 'fv');
});

test('soundTypeFor falls back to the regional rail sound type', () => {
  const instrumentation = new Instrumentation({
    regionalverkehr: namedSoundType('rv'),
  });
  assert.equal(instrumentation.soundTypeFor('unknown').name, 'rv');
});

test('the dropdown offers the four expected presets', () => {
  assert.deepEqual(
    [...INSTRUMENTATIONS.keys()],
    ['Sound-Familien', 'Schlagzeug', 'Gitarre (gedämpft)', 'Marimba (GM)'],
  );
});

test('every preset covers all four transport groups', () => {
  INSTRUMENTATIONS.forEach((instrumentation) => {
    TRANSPORT_GROUPS.forEach((group) => {
      const soundType = instrumentation.soundTypeFor(group);
      assert.equal(typeof soundType.arrival, 'function');
      assert.equal(typeof soundType.departure, 'function');
      assert.equal(typeof soundType.passthrough, 'function');
      assert.equal(typeof soundType.dwell, 'function');
    });
  });
});
