// Pitchless on purpose: a band of noise, not a note. A noteAdjust finds nothing
// to shift here.
export const noiseBrush = {
  name: 'noise-brush',
  kind: 'pitched',
  asset: null,
  base: {
    s: 'pink',
    bandf: 900,
    bandq: 6,
    attack: 0.001,
    decay: 0.05,
    sustain: 0,
    release: 0.05,
    gain: 0.18,
    duration: 0.08,
  },
};
