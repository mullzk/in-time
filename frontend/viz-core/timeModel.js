export const MIN_TEMPO = 60;
export const MAX_TEMPO = 900;
export const DEFAULT_TEMPO = 240;
export const SECONDS_PER_DAY = 24 * 3600;

const clamp = (value, low, high) => Math.min(Math.max(value, low), high);

export class TimeModel {
  constructor(rangeStart, rangeEnd) {
    this.rangeStart = rangeStart;
    this.rangeEnd = rangeEnd;
    this.current = rangeStart;
    this.tempo = DEFAULT_TEMPO;
    this.playing = false;
  }

  #span() {
    return this.rangeEnd - this.rangeStart;
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
    this.current = this.rangeStart + (elapsed % this.#span());
  }

  scrubberPosition() {
    return (this.current - this.rangeStart) / this.#span();
  }

  seekToPosition(position01) {
    this.current = this.rangeStart + clamp(position01, 0, 1) * this.#span();
  }

  seekToTime(seconds) {
    this.current = clamp(seconds, this.rangeStart, this.rangeEnd);
  }
}
