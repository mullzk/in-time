import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  hubVisits,
  standingCounts,
  standingSpan,
  TERMINUS_DWELL_SECONDS,
} from './hubVisits.js';
import { INTERREGIO, LONG_DISTANCE, REGIONAL } from './trainClasses.js';

const HUB = 7;
const ELSEWHERE = 1;

const call = (station, arr, dep) => ({ station, arr, dep });
const trip = (category, events) => ({ category, events });

test('a train calling on its way stands from its arrival to its departure', () => {
  const events = [
    call(ELSEWHERE, 0, 0),
    call(HUB, 100, 160),
    call(ELSEWHERE, 300, 300),
  ];
  assert.deepEqual(standingSpan(events, 1), { arrival: 100, departure: 160 });
});

test('a train starting at the hub stands the terminus dwell before it leaves', () => {
  const events = [call(HUB, 500, 500), call(ELSEWHERE, 700, 700)];
  assert.deepEqual(standingSpan(events, 0), {
    arrival: 500 - TERMINUS_DWELL_SECONDS,
    departure: 500,
  });
});

test('a train ending at the hub stands the terminus dwell after it arrives', () => {
  const events = [call(ELSEWHERE, 0, 0), call(HUB, 400, 400)];
  assert.deepEqual(standingSpan(events, 1), {
    arrival: 400,
    departure: 400 + TERMINUS_DWELL_SECONDS,
  });
});

test('the visits of a hub are the calls of shown trains at any of its stations', () => {
  const trips = [
    trip(0, [
      call(ELSEWHERE, 0, 0),
      call(HUB, 100, 160),
      call(ELSEWHERE, 300, 300),
    ]),
    trip(3, [
      call(ELSEWHERE, 0, 0),
      call(8, 200, 260),
      call(ELSEWHERE, 400, 400),
    ]),
    trip(5, [
      call(ELSEWHERE, 0, 0),
      call(HUB, 100, 130),
      call(ELSEWHERE, 200, 200),
    ]),
    trip(1, [call(ELSEWHERE, 0, 0), call(ELSEWHERE, 50, 60), call(2, 90, 90)]),
  ];
  assert.deepEqual(hubVisits(trips, new Set([HUB, 8])), [
    { arrival: 100, departure: 160, trainClass: LONG_DISTANCE },
    { arrival: 200, departure: 260, trainClass: REGIONAL },
  ]);
});

test('standing trains are counted per class', () => {
  const visits = [
    { arrival: 0, departure: 100, trainClass: LONG_DISTANCE },
    { arrival: 50, departure: 150, trainClass: INTERREGIO },
    { arrival: 60, departure: 70, trainClass: REGIONAL },
    { arrival: 60, departure: 200, trainClass: REGIONAL },
  ];
  assert.deepEqual(standingCounts(visits, 65), {
    [LONG_DISTANCE]: 1,
    [INTERREGIO]: 1,
    [REGIONAL]: 2,
  });
});

test('a train counts from the moment it arrives and no longer once it departs', () => {
  const visits = [{ arrival: 100, departure: 160, trainClass: INTERREGIO }];
  assert.equal(standingCounts(visits, 100)[INTERREGIO], 1);
  assert.equal(standingCounts(visits, 160)[INTERREGIO], 0);
});

test('an empty hub counts nothing in every class', () => {
  assert.deepEqual(standingCounts([], 0), {
    [LONG_DISTANCE]: 0,
    [INTERREGIO]: 0,
    [REGIONAL]: 0,
  });
});
