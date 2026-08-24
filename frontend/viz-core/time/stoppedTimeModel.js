// The time model for a panel that shows one moment rather than a passage of
// time. It answers everything a running TimeModel answers and does none of it:
// the render core may advance it, the keyboard may start it, and the picture
// stays where it is. A panel without a sense of time therefore needs no guards
// around a missing clock.
export class StoppedTimeModel {
  constructor(currentSeconds) {
    this.current = currentSeconds;
    this.playing = false;
    this.seekGeneration = 0;
  }

  advance() {}

  play() {}

  pause() {}

  togglePlay() {}

  seekToTime() {}

  seekToPosition() {}
}
