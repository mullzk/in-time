import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DWELL_MINIMUM_SECONDS } from './scheduling.js';
import { deriveStationEvents } from './stationEvents.js';

test('a real stop yields an arrival with dwell and a departure', () => {
  const events = deriveStationEvents([
    { arrival: 100, departure: 220, category: 3 },
  ]);
  assert.deepEqual(events, [
    { time: 100, kind: 'arrival', category: 3, dwellSeconds: 120 },
    { time: 220, kind: 'departure', category: 3 },
  ]);
});

test('a pass-through (arrival equals departure) yields one event', () => {
  const events = deriveStationEvents([
    { arrival: 300, departure: 300, category: 6 },
  ]);
  assert.deepEqual(events, [{ time: 300, kind: 'passthrough', category: 6 }]);
});

test('events from several trips are merged and time-sorted', () => {
  const events = deriveStationEvents([
    { arrival: 500, departure: 560, category: 0 },
    { arrival: 300, departure: 300, category: 6 },
  ]);
  assert.deepEqual(
    events.map((event) => [event.time, event.kind]),
    [
      [300, 'passthrough'],
      [500, 'arrival'],
      [560, 'departure'],
    ],
  );
});

test('a dwell across midnight stays positive', () => {
  const events = deriveStationEvents([
    { arrival: 86340, departure: 86460, category: 2 },
  ]);
  assert.equal(events[0].kind, 'arrival');
  assert.equal(events[0].dwellSeconds, 120);
  assert.equal(events[1].time, 86460);
});

test('the dwell threshold governs which arrivals get a dwell figure', () => {
  const [shortStop] = deriveStationEvents([
    { arrival: 0, departure: DWELL_MINIMUM_SECONDS - 1, category: 3 },
  ]);
  const [longStop] = deriveStationEvents([
    { arrival: 0, departure: DWELL_MINIMUM_SECONDS, category: 3 },
  ]);
  assert.ok(shortStop.dwellSeconds < DWELL_MINIMUM_SECONDS);
  assert.ok(longStop.dwellSeconds >= DWELL_MINIMUM_SECONDS);
});
