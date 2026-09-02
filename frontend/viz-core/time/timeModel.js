export const MIN_TEMPO = 10;
export const MAX_TEMPO = 900;
export const DEFAULT_TEMPO = 240;
export const SECONDS_PER_DAY = 24 * 3600;

const clamp = (value, low, high) => Math.min(Math.max(value, low), high);

export class TimeModel {
  // A day loops; a spread ends with its last arrival, where the clock rests.
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

  // Takes a new range and starts over at its beginning.
  setRange(rangeStart, rangeEnd) {
    this.rangeStart = rangeStart;
    this.rangeEnd = rangeEnd;
    this.seekToTime(rangeStart);
  }

  // For a range that grows under a picture already running: the clock keeps its
  // place instead of starting over.
  setRangeKeepingTime(rangeStart, rangeEnd) {
    this.rangeStart = rangeStart;
    this.rangeEnd = rangeEnd;
    this.current = clamp(this.current, rangeStart, rangeEnd);
  }

  // A range that has run out has nowhere to go from its end, so playing it
  // returns to the beginning.
  play() {
    if (this.#hasRunOut()) {
      this.seekToTime(this.rangeStart);
    }
    this.playing = true;
  }

  #hasRunOut() {
    return !this.repeats && this.current >= this.rangeEnd;
  }

  pause() {
    this.playing = false;
  }

  togglePlay() {
    if (this.playing) {
      this.pause();
      return;
    }
    this.play();
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

  // An empty range begins and ends at the same moment: no part of it is done.
  scrubberPosition() {
    return this.#span() === 0
      ? 0
      : (this.current - this.rangeStart) / this.#span();
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
