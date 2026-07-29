import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PercussiveSoundType, PitchedSoundType } from './soundType.js';

const capture = (invoke) => {
  let captured;
  invoke((parameters) => {
    captured = parameters;
  });
  return captured;
};

test('a pitched sound drops arrivals in pitch and pans them apart', () => {
  const soundType = new PitchedSoundType({ s: 'triangle', note: 60 });
  const arrival = capture((play) => soundType.arrival(play));
  const departure = capture((play) => soundType.departure(play));
  const passthrough = capture((play) => soundType.passthrough(play));
  assert.deepEqual([arrival.note, arrival.pan], [55, 0.35]);
  assert.deepEqual([departure.note, departure.pan], [60, 0.65]);
  assert.deepEqual([passthrough.note, passthrough.pan], [60, 0.5]);
});

test('uniformEvents plays the identical strike on arrival and departure', () => {
  const soundType = new PitchedSoundType({
    s: 'gm_marimba',
    note: 57,
    uniformEvents: true,
  });
  const arrival = capture((play) => soundType.arrival(play));
  const departure = capture((play) => soundType.departure(play));
  assert.deepEqual([arrival.note, arrival.pan], [57, 0.5]);
  assert.deepEqual([departure.note, departure.pan], [57, 0.5]);
});

test('a note-less pitched sound leaves the pitch untouched', () => {
  const soundType = new PitchedSoundType({ s: 'pink' });
  const arrival = capture((play) => soundType.arrival(play));
  assert.equal(arrival.note, undefined);
  assert.equal(arrival.pan, 0.35);
});

test('dwellStyle governs the standing figure', () => {
  const silent = new PitchedSoundType({
    s: 'gm_marimba',
    dwellStyle: 'silent',
  });
  assert.equal(silent.dwell(), null);

  const ring = new PitchedSoundType({ s: 'gm_marimba', dwellStyle: 'ring' });
  assert.equal(ring.dwell().sequence, 'gm_marimba*3');

  const pulse = new PitchedSoundType({ s: 'triangle' });
  assert.equal(pulse.dwell().sequence, 'triangle');
  assert.equal(pulse.dwell().cycleSeconds, 2);
});

test('a percussive sound slows arrivals and boosts departures', () => {
  const soundType = new PercussiveSoundType({ s: 'bd', gain: 0.4 });
  const arrival = capture((play) => soundType.arrival(play));
  const departure = capture((play) => soundType.departure(play));
  assert.deepEqual([arrival.s, arrival.speed, arrival.pan], ['bd', 0.8, 0.35]);
  assert.deepEqual([departure.s, departure.pan], ['bd', 0.65]);
  assert.ok(Math.abs(departure.gain - 0.6) < 1e-9);
  assert.equal(soundType.dwell().sequence, 'bd*8');
});

test('sources lists every sound bank a type can emit', () => {
  assert.deepEqual(new PitchedSoundType({ s: 'gm_marimba' }).sources(), [
    'gm_marimba',
  ]);
  assert.deepEqual(
    new PercussiveSoundType({
      s: 'mt',
      arrivalBank: 'lt',
      departureBank: 'ht',
    }).sources(),
    ['mt', 'lt', 'ht'],
  );
  assert.deepEqual(new PercussiveSoundType({ s: 'bd' }).sources(), ['bd']);
});

test('a percussive sound with per-event banks distinguishes by drum, not speed', () => {
  const toms = new PercussiveSoundType({
    s: 'mt',
    gain: 0.35,
    arrivalBank: 'lt',
    departureBank: 'ht',
  });
  const arrival = capture((play) => toms.arrival(play));
  const departure = capture((play) => toms.departure(play));
  assert.deepEqual([arrival.s, arrival.speed], ['lt', 1]);
  assert.deepEqual([departure.s, departure.gain], ['ht', 0.35]);
});
