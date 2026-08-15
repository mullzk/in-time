// The four instrumentations the sidebar dropdown offers. Each maps the five
// transport groups to a sound type; the merged Regionalverkehr group takes its
// flagship's voice, the Regio/RE tone. The InterRegio voice is placed between
// the Fernverkehr and the regional one -- shorter and less prominent than the
// first, weightier than the second -- so the rail hierarchy stays audible.

import { Instrumentation } from './instrumentation.js';
import { PercussiveSoundType, PitchedSoundType } from './soundType.js';

const FM_BELL = {
  s: 'sine',
  fmi: 8,
  fmh: 3.01,
  note: 76,
  attack: 0.002,
  decay: 0.15,
  sustain: 0.15,
  release: 1.2,
  gain: 0.35,
  duration: 0.3,
};
const FILTERED_SAWTOOTH = {
  s: 'sawtooth',
  cutoff: 1400,
  resonance: 8,
  note: 57,
  attack: 0.005,
  decay: 0.18,
  sustain: 0,
  release: 0.25,
  gain: 0.25,
  duration: 0.2,
};
const NOISE_BRUSH = {
  s: 'pink',
  bandf: 900,
  bandq: 6,
  attack: 0.001,
  decay: 0.05,
  sustain: 0,
  release: 0.05,
  gain: 0.18,
  duration: 0.08,
};

const GUITAR_MUTE = {
  s: 'gm_electric_guitar_muted',
  note: 60,
  attack: 0.002,
  decay: 0.08,
  sustain: 0.2,
  release: 0.2,
  gain: 0.3,
  duration: 0.15,
};
const MARIMBA = {
  s: 'gm_marimba',
  note: 60,
  attack: 0.001,
  decay: 0.05,
  sustain: 1,
  release: 0.2,
  gain: 0.3,
  duration: 0.2,
};

const soundFamilies = new Instrumentation({
  fernverkehr: new PitchedSoundType({ ...FM_BELL }),
  interregio: new PitchedSoundType({
    ...FM_BELL,
    fmi: 6,
    note: 71,
    decay: 0.13,
    release: 1.0,
    gain: 0.3,
  }),
  regionalverkehr: new PitchedSoundType({ ...FILTERED_SAWTOOTH }),
  tram: new PitchedSoundType({
    ...FM_BELL,
    fmi: 5,
    fmh: 2.0,
    note: 69,
    decay: 0.12,
    sustain: 0.1,
    release: 0.8,
    duration: 0.25,
  }),
  bus: new PitchedSoundType({ ...NOISE_BRUSH }),
});

const drumSet = new Instrumentation({
  fernverkehr: new PercussiveSoundType({ s: 'bd', gain: 0.4, duration: 0.2 }),
  interregio: new PercussiveSoundType({ s: 'sd', gain: 0.3, duration: 0.2 }),
  regionalverkehr: new PercussiveSoundType({
    s: 'mt',
    gain: 0.35,
    duration: 0.25,
    arrivalBank: 'lt',
    departureBank: 'ht',
  }),
  tram: new PercussiveSoundType({ s: 'rd', gain: 0.3, duration: 0.4 }),
  bus: new PercussiveSoundType({ s: 'bd', gain: 0.25, duration: 0.2 }),
});

const guitarShades = new Instrumentation({
  fernverkehr: new PitchedSoundType({
    ...GUITAR_MUTE,
    note: 55,
    sustain: 0.3,
    release: 0.7,
    gain: 0.32,
    duration: 0.4,
    uniformEvents: true,
  }),
  interregio: new PitchedSoundType({
    ...GUITAR_MUTE,
    note: 57,
    release: 0.5,
    duration: 0.3,
  }),
  regionalverkehr: new PitchedSoundType({
    ...GUITAR_MUTE,
    note: 59,
    release: 0.35,
    duration: 0.2,
  }),
  tram: new PitchedSoundType({
    ...GUITAR_MUTE,
    note: 62,
    release: 0.08,
    duration: 0.06,
  }),
  bus: new PitchedSoundType({
    ...GUITAR_MUTE,
    note: 61,
    release: 0.15,
    duration: 0.1,
    gain: 0.25,
  }),
});

const marimbaGmShades = new Instrumentation({
  fernverkehr: new PitchedSoundType({
    ...MARIMBA,
    note: 57,
    release: 1.1,
    gain: 0.42,
    duration: 0.5,
    uniformEvents: true,
    dwellStyle: 'ring',
  }),
  interregio: new PitchedSoundType({
    ...MARIMBA,
    note: 58,
    release: 0.6,
    gain: 0.36,
    duration: 0.3,
  }),
  regionalverkehr: new PitchedSoundType({
    ...MARIMBA,
    note: 59,
    release: 0.35,
    duration: 0.2,
  }),
  tram: new PitchedSoundType({
    ...MARIMBA,
    note: 62,
    release: 0.08,
    duration: 0.06,
    gain: 0.25,
  }),
  bus: new PitchedSoundType({
    ...MARIMBA,
    note: 61,
    release: 0.15,
    duration: 0.1,
    gain: 0.25,
  }),
});

export const INSTRUMENTATIONS = new Map([
  ['Sound-Familien', soundFamilies],
  ['Schlagzeug', drumSet],
  ['Gitarre (gedämpft)', guitarShades],
  ['Marimba (GM)', marimbaGmShades],
]);
