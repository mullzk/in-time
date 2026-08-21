import { MAX_TEMPO, MIN_TEMPO } from './timeModel.js';

// The tempo slider's travel: a pause zone at the left anchor, then a geometric
// run up to the fastest tempo. Linear travel would spend nearly all of it on the
// fast half -- the slowest tempo is a ninetieth of the fastest -- and leave the
// slow tempos on a few pixels; geometrically, every doubling takes the same
// distance.
export const PAUSE_SHARE = 0.08;
export const PAUSE_POSITION = 0;

const TEMPO_SPAN = MAX_TEMPO / MIN_TEMPO;
const RUNNING_SHARE = 1 - PAUSE_SHARE;

const clamp = (value, low, high) => Math.min(Math.max(value, low), high);

export const isPausePosition = (position) => position < PAUSE_SHARE;

export const tempoForSliderPosition = (position) =>
  MIN_TEMPO *
  TEMPO_SPAN ** clamp((position - PAUSE_SHARE) / RUNNING_SHARE, 0, 1);

export const sliderPositionForTempo = (tempo) =>
  PAUSE_SHARE +
  RUNNING_SHARE *
    clamp(Math.log(tempo / MIN_TEMPO) / Math.log(TEMPO_SPAN), 0, 1);
