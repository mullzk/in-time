// The two kinds of sound and how each marks the four events, as data. A kind is
// the widest layer a value can come from: everything below it -- the timbre, the
// document, the transport group, the event -- may say something else.

export const PAN_BY_SIDE = { left: 0.35, center: 0.5, right: 0.65 };

export const KINDS = {
  // Distinguishes the events by pitch and side.
  pitched: {
    dwellType: 'repeat',
    events: {
      arrival: { noteAdjust: -5, pan: 'left' },
      departure: { pan: 'right' },
      passthrough: { pan: 'center' },
      dwell: {
        intervalSeconds: 2,
        pan: 'center',
        noteAdjust: -12,
        gain: 0.05,
        attack: 0.05,
        decay: 0.1,
        sustain: 0.8,
        release: 0.3,
      },
    },
  },
  // A drum cannot change pitch, so the events differ by speed and loudness.
  percussive: {
    dwellType: 'repeat',
    events: {
      arrival: { pan: 'left', speed: 0.8 },
      departure: { pan: 'right', gainFactor: 1.5 },
      passthrough: { pan: 'center' },
      dwell: { intervalSeconds: 0.125, pan: 'center', gainFactor: 0.45 },
    },
  },
};
