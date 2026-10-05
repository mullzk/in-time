import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  hubSpansByTrip,
  hubVisits,
  standingCounts,
  standingSpan,
  TERMINUS_DWELL_SECONDS,
  withinAHubSpan,
} from './hubVisits.js';
import { ARRIVING, DEPARTING } from './taktPhase.js';
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

const HUB_STATIONS = new Set([HUB]);
const FAR = 2;
const FURTHER = 3;

const LONG_RUN = trip(0, [
  call(ELSEWHERE, 0, 0),
  call(FAR, 100, 110),
  call(FURTHER, 200, 210),
  call(HUB, 300, 360),
  call(ELSEWHERE, 500, 500),
]);

test('the run to a hub and the run away from it are told apart', () => {
  const [spans] = hubSpansByTrip([LONG_RUN], HUB_STATIONS);

  assert.deepEqual(spans, [
    { phase: ARRIVING, from: 210, to: 360 },
    { phase: DEPARTING, from: 360, to: 500 },
  ]);
});

test('a train heading for a hub shows no departure phase, whatever the clock says', () => {
  const [spans] = hubSpansByTrip([LONG_RUN], HUB_STATIONS);

  assert.ok(withinAHubSpan(spans, ARRIVING, 250), 'on its way to the hub');
  assert.ok(!withinAHubSpan(spans, DEPARTING, 250), 'it left no hub behind');
});

test('a train that has left a hub shows no arrival phase', () => {
  const [spans] = hubSpansByTrip([LONG_RUN], HUB_STATIONS);

  assert.ok(withinAHubSpan(spans, DEPARTING, 450), 'on its way out');
  assert.ok(!withinAHubSpan(spans, ARRIVING, 450), 'no hub lies ahead');
});

test('a run far from its hub belongs to neither phase', () => {
  const [spans] = hubSpansByTrip([LONG_RUN], HUB_STATIONS);

  [ARRIVING, DEPARTING].forEach((phase) => {
    assert.ok(!withinAHubSpan(spans, phase, 150), 'two calls short of the hub');
    assert.ok(!withinAHubSpan(spans, phase, 501), 'the run is over');
  });
});

test('a run touching no hub belongs to none', () => {
  const [spans] = hubSpansByTrip(
    [trip(0, [call(ELSEWHERE, 0, 0), call(FAR, 100, 100)])],
    HUB_STATIONS,
  );

  assert.deepEqual(spans, []);
});

test('a run starting at a hub has no approach to it, one ending there no departure', () => {
  const [starts, ends] = hubSpansByTrip(
    [
      trip(0, [call(HUB, 0, 60), call(FAR, 200, 200)]),
      trip(0, [call(FAR, 0, 0), call(HUB, 200, 200)]),
    ],
    HUB_STATIONS,
  );

  assert.deepEqual(starts, [{ phase: DEPARTING, from: 60, to: 200 }]);
  assert.deepEqual(ends, [{ phase: ARRIVING, from: 0, to: 200 }]);
});

test('a run between two hubs leaves one and reaches the next', () => {
  const [spans] = hubSpansByTrip(
    [
      trip(0, [
        call(HUB, 0, 60),
        call(FAR, 200, 210),
        call(FURTHER, 400, 410),
        call(HUB, 600, 600),
      ]),
    ],
    HUB_STATIONS,
  );

  assert.ok(withinAHubSpan(spans, DEPARTING, 100), 'still leaving the first');
  assert.ok(withinAHubSpan(spans, ARRIVING, 500), 'already nearing the second');
  [ARRIVING, DEPARTING].forEach((phase) => {
    assert.ok(
      !withinAHubSpan(spans, phase, 300),
      'the stretch between is bare',
    );
  });
});
