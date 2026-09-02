import { MAX_TEMPO, MIN_TEMPO } from '../time/timeModel.js';

// The tempo slider runs geometrically from the slowest tempo to the fastest, so
// every doubling takes the same distance; linear travel would leave the slow
// tempos, a ninetieth of the fastest, on a few pixels.
const TEMPO_SPAN = MAX_TEMPO / MIN_TEMPO;

const clamp = (value, low, high) => Math.min(Math.max(value, low), high);

export const tempoForSliderPosition = (position) =>
  MIN_TEMPO * TEMPO_SPAN ** clamp(position, 0, 1);

export const sliderPositionForTempo = (tempo) =>
  clamp(Math.log(tempo / MIN_TEMPO) / Math.log(TEMPO_SPAN), 0, 1);
