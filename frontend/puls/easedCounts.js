/**
 * Counts that follow their target smoothly, like a CSS transition. Time is
 * wall-clock time, so the swell reads the same at every playback tempo.
 */

// After one time constant, 63 % of a change is done.
export const EASING_TIME_CONSTANT_SECONDS = 0.35;

export class EasedCounts {
  constructor() {
    this.current = null;
  }

  easeTowards(target, deltaSeconds) {
    if (this.current === null) {
      this.current = { ...target };
      return this.current;
    }
    const remaining = Math.exp(-deltaSeconds / EASING_TIME_CONSTANT_SECONDS);
    this.current = Object.fromEntries(
      Object.entries(target).map(([key, value]) => [
        key,
        value + (this.current[key] - value) * remaining,
      ]),
    );
    return this.current;
  }
}
