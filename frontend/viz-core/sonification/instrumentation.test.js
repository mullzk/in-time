import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Instrumentation } from './instrumentation.js';

const documentWith = (extra) =>
  Instrumentation.fromDocument({
    instrumentation: 'Probe',
    sound: 'marimba',
    ...extra,
  });

const parametersOf = (instrumentation, group, eventKind) =>
  instrumentation.parametersFor(group, eventKind).parameters;

test('an event without a setting inherits it from its transport group', () => {
  const instrumentation = documentWith({
    fernverkehr: { gain: 0.7, arrival: { gain: 0.9 } },
  });

  assert.equal(
    parametersOf(instrumentation, 'fernverkehr', 'arrival').gain,
    0.9,
  );
  assert.equal(
    parametersOf(instrumentation, 'fernverkehr', 'departure').gain,
    0.7,
  );
});

test('a transport group without a setting inherits it from the document', () => {
  const instrumentation = documentWith({
    gain: 0.5,
    tram: { sound: 'snare' },
  });

  assert.equal(parametersOf(instrumentation, 'tram', 'arrival').gain, 0.5);
  assert.equal(
    parametersOf(instrumentation, 'regionalverkehr', 'arrival').gain,
    0.5,
  );
});

test('a setting the document leaves out comes from the sound itself', () => {
  const instrumentation = documentWith({});

  assert.equal(
    parametersOf(instrumentation, 'fernverkehr', 'arrival').s,
    'gm_marimba',
  );
  assert.equal(
    parametersOf(instrumentation, 'fernverkehr', 'arrival').attack,
    0.001,
  );
});

test('the kind decides how the events differ when nothing else does', () => {
  const instrumentation = documentWith({ note: 60 });

  const arrival = parametersOf(instrumentation, 'fernverkehr', 'arrival');
  const departure = parametersOf(instrumentation, 'fernverkehr', 'departure');
  const passthrough = parametersOf(
    instrumentation,
    'fernverkehr',
    'passthrough',
  );
  assert.deepEqual([arrival.note, arrival.pan], [55, 0.35]);
  assert.deepEqual([departure.note, departure.pan], [60, 0.65]);
  assert.deepEqual([passthrough.note, passthrough.pan], [60, 0.5]);
});

test('a relative setting is replaced by a deeper one, not added to it', () => {
  const instrumentation = documentWith({
    note: 60,
    interregio: { noteAdjust: 5, arrival: { noteAdjust: 1 } },
  });

  // The kind drops arrivals by five semitones; the group lifts its own by five
  // and the event overrules that in turn.
  assert.equal(parametersOf(instrumentation, 'interregio', 'arrival').note, 61);
  assert.equal(
    parametersOf(instrumentation, 'interregio', 'departure').note,
    65,
  );
  assert.equal(
    parametersOf(instrumentation, 'fernverkehr', 'arrival').note,
    55,
  );
});

test('an arrival can be told to sound like a departure', () => {
  const instrumentation = documentWith({
    note: 60,
    fernverkehr: { arrival: { noteAdjust: 0, pan: 'center' } },
  });

  const arrival = parametersOf(instrumentation, 'fernverkehr', 'arrival');
  const departure = parametersOf(instrumentation, 'fernverkehr', 'departure');
  assert.equal(arrival.note, departure.note);
  assert.equal(arrival.pan, 0.5);
});

test('a gain factor multiplies the gain that was resolved for it', () => {
  const instrumentation = documentWith({
    gain: 0.4,
    fernverkehr: { gainFactor: 0.5, arrival: { gainFactor: 0.25 } },
    interregio: { gain: 0.1, gainFactor: 2 },
  });

  assert.equal(
    parametersOf(instrumentation, 'fernverkehr', 'arrival').gain,
    0.1,
  );
  assert.equal(
    parametersOf(instrumentation, 'fernverkehr', 'departure').gain,
    0.2,
  );
  assert.equal(
    parametersOf(instrumentation, 'interregio', 'departure').gain,
    0.2,
  );
});

test('pan takes a side or a number', () => {
  const instrumentation = documentWith({
    fernverkehr: {
      arrival: { pan: 'right' },
      departure: { pan: 'center' },
      passthrough: { pan: 0.9 },
    },
  });

  assert.equal(
    parametersOf(instrumentation, 'fernverkehr', 'arrival').pan,
    0.65,
  );
  assert.equal(
    parametersOf(instrumentation, 'fernverkehr', 'departure').pan,
    0.5,
  );
  assert.equal(
    parametersOf(instrumentation, 'fernverkehr', 'passthrough').pan,
    0.9,
  );
});

test('an event may play a sound of its own', () => {
  const instrumentation = documentWith({
    gain: 0.42,
    regionalverkehr: {
      sound: 'mid-tom',
      arrival: { sound: 'low-tom' },
      departure: { sound: 'high-tom' },
    },
  });

  const arrival = parametersOf(instrumentation, 'regionalverkehr', 'arrival');
  const departure = parametersOf(
    instrumentation,
    'regionalverkehr',
    'departure',
  );
  const passthrough = parametersOf(
    instrumentation,
    'regionalverkehr',
    'passthrough',
  );
  assert.deepEqual([arrival.s, departure.s, passthrough.s], ['lt', 'ht', 'mt']);
  // The document's own value survives the change of sound.
  assert.equal(arrival.gain, 0.42);
  // …and so does the kind of the sound now in play: a drum speeds down on
  // arrival where the marimba would have dropped in pitch.
  assert.equal(arrival.speed, 0.8);
  assert.equal(arrival.note, undefined);
});

test('a standing vehicle is silent, struck once, or struck over and over', () => {
  const silent = documentWith({ dwellType: 'none' });
  assert.equal(silent.dwellFigureFor('fernverkehr'), null);

  const once = documentWith({
    dwellType: 'once',
    fernverkehr: { dwell: { duration: 4 } },
  });
  const single = once.dwellFigureFor('fernverkehr');
  assert.equal(single.intervalSeconds, null);
  assert.equal(single.durationSeconds, 4);

  const repeated = documentWith({
    dwellType: 'repeat',
    fernverkehr: { dwell: { intervalSeconds: 0.2, gainFactor: 0.5 } },
  });
  const figure = repeated.dwellFigureFor('fernverkehr');
  assert.equal(figure.intervalSeconds, 0.2);
  // A hit lasts as long as the gap to the next one unless the block says
  // otherwise.
  assert.equal(figure.durationSeconds, 0.2);
});

test('the standing figure follows the transport group it belongs to', () => {
  const instrumentation = documentWith({
    dwellType: 'none',
    fernverkehr: { dwellType: 'repeat', dwell: { intervalSeconds: 0.5 } },
  });

  assert.equal(
    instrumentation.dwellFigureFor('fernverkehr').intervalSeconds,
    0.5,
  );
  assert.equal(instrumentation.dwellFigureFor('regionalverkehr'), null);
});

test('every sound a document can reach is named for the warm-up', () => {
  const instrumentation = documentWith({
    tram: { sound: 'ride-cymbal' },
    bus: { sound: 'snare', arrival: { sound: 'closed-hihat' } },
  });

  assert.deepEqual(instrumentation.sources().sort(), [
    'gm_marimba',
    'hh',
    'rd',
    'sd',
  ]);
});

test('a document names itself', () => {
  assert.equal(documentWith({}).name, 'Probe');
  assert.throws(
    () => Instrumentation.fromDocument({ sound: 'marimba' }),
    /instrumentation/,
  );
});

test('a document that cannot be played is refused, saying where', () => {
  assert.throws(
    () => documentWith({ tram: { sound: 'tuba' } }),
    /tuba.*tram|tram.*tuba/,
  );
  assert.throws(() => documentWith({ seilbahn: { gain: 0.2 } }), /seilbahn/);
  assert.throws(
    () => documentWith({ tram: { anreise: { gain: 0.2 } } }),
    /anreise/,
  );
  assert.throws(() => documentWith({ dwellType: 'wobble' }), /wobble/);
  assert.throws(
    () =>
      documentWith({
        dwellType: 'repeat',
        tram: { dwell: { intervalSeconds: 0 } },
      }),
    /intervalSeconds/,
  );
  // An event block belongs to a transport group; at the root it would leave
  // "event or group, which is more specific?" open.
  assert.throws(() => documentWith({ dwell: { gainFactor: 0.5 } }), /dwell/);
});

test('a setting we do not know is handed to the audio engine untouched', () => {
  const instrumentation = documentWith({ fernverkehr: { crush: 4 } });

  assert.equal(
    parametersOf(instrumentation, 'fernverkehr', 'arrival').crush,
    4,
  );
});
