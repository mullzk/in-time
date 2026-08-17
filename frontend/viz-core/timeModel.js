export const MIN_TEMPO = 60;
export const MAX_TEMPO = 900;
export const DEFAULT_TEMPO = 240;
export const SECONDS_PER_DAY = 24 * 3600;

const clamp = (value, low, high) => Math.min(Math.max(value, low), high);

export class TimeModel {
  // A day loops -- it has no end one could arrive at. A spread does: once the
  // last vehicle has landed it is over, and the clock comes to rest there.
  constructor(rangeStart, rangeEnd, { repeats = true } = {}) {
    this.rangeStart = rangeStart;
    this.rangeEnd = rangeEnd;
    this.repeats = repeats;
    this.current = rangeStart;
    this.tempo = DEFAULT_TEMPO;
    this.playing = false;
    // Bumped on every explicit seek so time-driven consumers (the sonifier's
    // scheduler) can tell a scrub apart from the steady advance and resync.
    this.seekGeneration = 0;
  }

  #span() {
    return this.rangeEnd - this.rangeStart;
  }

  // The stretch of day a panel shows can change under it: a spread from another
  // starting point runs from another moment to another end, and the clock starts
  // over at its beginning.
  setRange(rangeStart, rangeEnd) {
    this.rangeStart = rangeStart;
    this.rangeEnd = rangeEnd;
    this.seekToTime(rangeStart);
  }

  play() {
    this.playing = true;
  }

  pause() {
    this.playing = false;
  }

  togglePlay() {
    this.playing = !this.playing;
  }

  setTempo(value) {
    this.tempo = clamp(value, MIN_TEMPO, MAX_TEMPO);
  }

  advance(realDeltaSeconds) {
    if (!this.playing) {
      return;
    }
    const elapsed =
      this.current - this.rangeStart + this.tempo * realDeltaSeconds;
    if (!this.repeats && elapsed >= this.#span()) {
      this.current = this.rangeEnd;
      this.pause();
      return;
    }
    this.current = this.rangeStart + (elapsed % this.#span());
  }

  scrubberPosition() {
    return (this.current - this.rangeStart) / this.#span();
  }

  seekToPosition(position01) {
    this.current = this.rangeStart + clamp(position01, 0, 1) * this.#span();
    this.seekGeneration += 1;
  }

  seekToTime(seconds) {
    this.current = clamp(seconds, this.rangeStart, this.rangeEnd);
    this.seekGeneration += 1;
  }
}
