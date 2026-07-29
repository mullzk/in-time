import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Sonifier } from './sonifier.js';

// A minimal sound type: every event fires one plain one-shot, no dwell figure,
// so a played event shows up as exactly one audioBridge.play call.
const soundType = {
  arrival: (play) => play({ gain: 0.3 }),
  departure: (play) => play({ gain: 0.3 }),
  passthrough: (play) => play({ gain: 0.3 }),
  dwell: () => null,
  sources: () => ['sine'],
};
const instrumentation = { soundTypeFor: () => soundType };

class FakeAudioBridge {
  constructor() {
    this.started = false;
    this.currentTime = 0;
    this.plays = [];
  }

  // The test controls `started` directly, so start() stays a no-op: it stands in
  // for a load whose completion the test times explicitly.
  async start() {}
  async warmUp() {}
  mini() {
    return { queryArc: () => [] };
  }

  play(parameters, deadline, duration) {
    this.plays.push({ parameters, deadline, duration });
  }
}

function makeHarness(events) {
  const bridge = new FakeAudioBridge();
  const timeModel = { current: 0, tempo: 1, seekGeneration: 0 };
  const panel = {
    stationSoundEvents: () => events,
    hiddenTransportGroups: () => [],
  };
  const sonifier = new Sonifier(panel, timeModel, bridge);
  return { bridge, timeModel, sonifier };
}

const pastEvents = [
  { time: 100, kind: 'passthrough', category: 0 },
  { time: 200, kind: 'passthrough', category: 0 },
  { time: 300, kind: 'passthrough', category: 0 },
];

test('resuming after an inactive preset does not replay elapsed events', () => {
  const { bridge, timeModel, sonifier } = makeHarness(pastEvents);
  bridge.started = true;
  timeModel.current = 90;
  sonifier.setInstrumentation(instrumentation);
  sonifier.setStation('station');
  sonifier.onFrameRendered();
  assert.equal(bridge.plays.length, 0);

  sonifier.setInstrumentation(null);
  sonifier.onFrameRendered();
  timeModel.current = 250;
  sonifier.setInstrumentation(instrumentation);
  bridge.currentTime = 5;
  sonifier.onFrameRendered();
  assert.equal(bridge.plays.length, 0);

  timeModel.current = 299.95;
  sonifier.onFrameRendered();
  assert.equal(bridge.plays.length, 1);
});

test('a rendering stall skips the elapsed backlog instead of bursting', () => {
  const { bridge, timeModel, sonifier } = makeHarness(pastEvents);
  bridge.started = true;
  timeModel.current = 90;
  sonifier.setInstrumentation(instrumentation);
  sonifier.setStation('station');
  sonifier.onFrameRendered();
  assert.equal(bridge.plays.length, 0);

  // A backgrounded tab: the audio clock ran on while rendering stalled, so the
  // sim clock leaps far forward in a single frame. The events elapsed in the
  // gap must be skipped, not all scheduled at once.
  timeModel.current = 350;
  bridge.currentTime = 260;
  sonifier.onFrameRendered();
  assert.equal(bridge.plays.length, 0);

  timeModel.current = 350.1;
  sonifier.onFrameRendered();
  assert.equal(bridge.plays.length, 0);
});

test('events elapsed while audio was loading do not burst on first frame', () => {
  const { bridge, timeModel, sonifier } = makeHarness(pastEvents);
  timeModel.current = 90;
  sonifier.setInstrumentation(instrumentation);
  sonifier.setStation('station');

  sonifier.onFrameRendered();
  timeModel.current = 250;
  bridge.started = true;
  bridge.currentTime = 5;
  sonifier.onFrameRendered();
  assert.equal(bridge.plays.length, 0);

  timeModel.current = 299.95;
  sonifier.onFrameRendered();
  assert.equal(bridge.plays.length, 1);
});
