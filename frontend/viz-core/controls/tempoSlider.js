import { MAX_TEMPO, MIN_TEMPO } from '../time/timeModel.js';

// The tempo slider's travel: a geometric run from the slowest tempo to the
// fastest. Linear travel would spend nearly all of it on the fast half -- the
// slowest tempo is a ninetieth of the fastest -- and leave the slow tempos on a
// few pixels; geometrically, every doubling takes the same distance. The slider
// says nothing about whether the picture runs: stopping it is the play control's
// business, and a tempo chosen while it stands still is the tempo it takes up
// again with.
const TEMPO_SPAN = MAX_TEMPO / MIN_TEMPO;

const clamp = (value, low, high) => Math.min(Math.max(value, low), high);

export const tempoForSliderPosition = (position) =>
  MIN_TEMPO * TEMPO_SPAN ** clamp(position, 0, 1);

export const sliderPositionForTempo = (tempo) =>
  clamp(Math.log(tempo / MIN_TEMPO) / Math.log(TEMPO_SPAN), 0, 1);
