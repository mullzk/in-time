import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Sonifier } from './sonifier.js';

// A minimal instrumentation: every event is one plain one-shot and nothing
// sounds while a vehicle stands, so a played event shows up as exactly one
// audioBridge.play call.
const instrumentation = {
  parametersFor: () => ({
    durationSeconds: 0.2,
    parameters: { s: 'sine', gain: 0.3 },
  }),
  dwellFigureFor: () => null,
  sources: () => ['sine'],
};

class FakeAudioBridge {
  constructor() {
    this.started = false;
    this.currentTime = 0;
    this.plays = [];
    this.starts = 0;
    this.warmedSources = [];
  }

  // The test controls `started` directly, so start() only counts its calls: it
  // stands in for a load whose completion the test times explicitly.
  async start() {
    this.starts += 1;
  }

  async warmUp(sources) {
    this.warmedSources.push(sources);
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

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

// The audio context may only start on a user gesture. A station named in the
// address is chosen without one, so the start does not take; picking an
// instrumentation is a gesture and has to start it again.
test('picking an instrumentation starts audio the station could not', async () => {
  const { bridge, sonifier } = makeHarness(pastEvents);
  sonifier.setStation('station');
  await settle();
  assert.equal(bridge.starts, 1, 'the station tried');

  sonifier.setInstrumentation(instrumentation);
  await settle();

  assert.equal(bridge.starts, 2, 'and the instrumentation tries again');
  assert.deepEqual(bridge.warmedSources.at(-1), ['sine']);
});

test('dropping the instrumentation starts no audio', async () => {
  const { bridge, sonifier } = makeHarness(pastEvents);

  sonifier.setInstrumentation(null);
  await settle();

  assert.equal(bridge.starts, 0);
});
