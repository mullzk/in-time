// A sound type turns a station's timetable events into superdough one-shots: one
// tone for arrival, departure and pass-through, plus an optional dwell figure
// for a standing vehicle. Each event method receives a `play(parameters)`
// callback and calls it once; the Sonifier adds timing, master volume and
// density damping. dwell() instead returns a repeating Strudel mini-notation
// figure (or null for silence) that the Sonifier loops until the vehicle leaves.
//
// Two behaviours cover every preset: PitchedSoundType for synths and pitched
// soundfonts, PercussiveSoundType for drum samples. Individual timbres are just
// parameter configurations of these two (see presets.js).

const withPan = (sound, pan) => ({ ...sound, pan });

const shiftedPitch = (sound, pan, semitones) => {
  const parameters = withPan(sound, pan);
  if (parameters.note !== undefined && semitones) {
    parameters.note += semitones;
  }
  return parameters;
};

const ARRIVAL_SEMITONES = -5;
const ARRIVAL_PAN = 0.35;
const DEPARTURE_PAN = 0.65;
const CENTRE_PAN = 0.5;

export class PitchedSoundType {
  // No default note: a pitch belongs to the timbre (see presets.js). A pitchless
  // sound such as the noise brush stays pitchless, and shiftedPitch skips it.
  static baseSound = {
    s: 'sine',
    attack: 0.002,
    decay: 0.1,
    sustain: 0,
    release: 0.2,
    gain: 0.3,
    duration: 0.2,
  };

  // uniformEvents plays the identical strike on arrival and departure -- the
  // steady Fernverkehr anchor of the clock-face timetable. dwellStyle picks the
  // standing figure: 'pulse' (a quiet tone an octave down), 'ring' (a sparse
  // swelling figure on the base note) or 'silent'.
  constructor({ uniformEvents = false, dwellStyle = 'pulse', ...sound } = {}) {
    this.sound = { ...PitchedSoundType.baseSound, ...sound };
    this.uniformEvents = uniformEvents;
    this.dwellStyle = dwellStyle;
  }

  sources() {
    return [this.sound.s];
  }

  arrival(play) {
    play(
      this.uniformEvents
        ? shiftedPitch(this.sound, CENTRE_PAN, 0)
        : shiftedPitch(this.sound, ARRIVAL_PAN, ARRIVAL_SEMITONES),
    );
  }

  departure(play) {
    play(
      shiftedPitch(
        this.sound,
        this.uniformEvents ? CENTRE_PAN : DEPARTURE_PAN,
        0,
      ),
    );
  }

  passthrough(play) {
    play(shiftedPitch(this.sound, CENTRE_PAN, 0));
  }

  dwell() {
    if (this.dwellStyle === 'silent') {
      return null;
    }
    if (this.dwellStyle === 'ring') {
      return {
        sequence: `${this.sound.s}*3`,
        cycleSeconds: 1,
        parameters: {
          ...shiftedPitch(this.sound, CENTRE_PAN, 0),
          gain: (this.sound.gain ?? 0.3) * 0.42,
          attack: 0.12,
          decay: 1.5,
          sustain: 0.2,
          release: 0.7,
        },
      };
    }
    return {
      sequence: this.sound.s,
      cycleSeconds: 2,
      parameters: {
        ...shiftedPitch(this.sound, CENTRE_PAN, -12),
        gain: 0.05,
        attack: 0.05,
        decay: 0.1,
        sustain: 0.8,
        release: 0.3,
      },
    };
  }
}

export class PercussiveSoundType {
  static baseSound = { s: 'bd', gain: 0.4, duration: 0.2 };

  // A distinct arrivalBank/departureBank marks the event kind by drum (the toms
  // do this); without one, arrivals slow down and departures grow louder.
  constructor({ arrivalBank, departureBank, ...sound } = {}) {
    this.sound = { ...PercussiveSoundType.baseSound, ...sound };
    this.arrivalBank = arrivalBank ?? this.sound.s;
    this.departureBank = departureBank ?? this.sound.s;
  }

  sources() {
    return [...new Set([this.sound.s, this.arrivalBank, this.departureBank])];
  }

  arrival(play) {
    const bankMarksArrival = this.arrivalBank !== this.sound.s;
    play({
      ...this.sound,
      s: this.arrivalBank,
      pan: ARRIVAL_PAN,
      speed: bankMarksArrival ? 1 : 0.8,
    });
  }

  departure(play) {
    const bankMarksDeparture = this.departureBank !== this.sound.s;
    play({
      ...this.sound,
      s: this.departureBank,
      pan: DEPARTURE_PAN,
      gain: this.sound.gain * (bankMarksDeparture ? 1 : 1.5),
    });
  }

  passthrough(play) {
    play({ ...this.sound, pan: CENTRE_PAN });
  }

  dwell() {
    return {
      sequence: `${this.sound.s}*8`,
      cycleSeconds: 1,
      parameters: {
        ...this.sound,
        pan: CENTRE_PAN,
        gain: this.sound.gain * 0.45,
      },
    };
  }
}
