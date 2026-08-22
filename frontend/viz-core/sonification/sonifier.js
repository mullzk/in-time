// The runtime coordinator: it turns the events of the one selected station into
// sound as the shared simulation clock plays. Called every frame, it schedules
// the events falling into a short lookahead window through the pure scheduling
// rules (mute, group gap, voice budget, density damping) and keeps the standing
// dwell figures running, all against the audio clock. It plays only while an
// instrumentation is chosen and a station is selected; selecting or double-
// clicking a station re-seats it, scrubbing and the loop wrap resync it.

import {
  cursorAtOrAfter,
  DENSITY_DAMPING_VOICES,
  DWELL_MINIMUM_SECONDS,
  dropPriorityOf,
  eventsInLookahead,
  gainDampingForDensity,
  groupOf,
  LOOKAHEAD_SECONDS,
  MAXIMUM_VOICES_PER_WINDOW,
  MINIMUM_GROUP_GAP_SECONDS,
  passesGroupGap,
  passesMuteFilter,
  passesVoiceBudget,
} from './scheduling.js';

// A rendered frame this far apart in real time is a rendering stall (a
// backgrounded tab), not the steady advance: the sim clock leaped over a stretch
// of events while the audio clock ran on, so we resync past them rather than
// schedule the whole backlog at once.
const STALL_RESYNC_SECONDS = 0.5;

// A fixed master level (no slider); the per-sound gains and the density damping
// do the balancing, system volume does the rest.
const MASTER_GAIN = 0.9;
const DEFAULT_GAIN = 0.3;

export class Sonifier {
  constructor(panel, timeModel, audioBridge) {
    this.panel = panel;
    this.timeModel = timeModel;
    this.audioBridge = audioBridge;
    this.instrumentation = null;
    this.station = null;
    this.events = [];
    this.wasActive = false;
    this.cursor = 0;
    this.lastSimTime = 0;
    this.lastSeekGeneration = timeModel.seekGeneration;
    this.lastTimeByGroup = new Map();
    this.recentVoiceTimes = [];
    this.dwellVoices = [];
  }

  setInstrumentation(instrumentation) {
    this.instrumentation = instrumentation;
    this.dwellVoices = [];
    if (instrumentation && this.audioBridge.started) {
      this.audioBridge.warmUp(this.#sources());
    }
  }

  setStation(station) {
    this.station = station;
    this.events = this.panel.stationSoundEvents(station);
    this.#resync();
    this.#ensureAudio();
  }

  // Nobody is listening to a place any more: the events are dropped rather than
  // asked of a station that is no longer there.
  forgetStation() {
    this.station = null;
    this.events = [];
    this.#resync();
  }

  // Re-reads the chosen station's events after the panel gained a schedule, so a
  // station picked before the buses arrived starts sounding them too.
  refreshStation() {
    if (this.station !== null) {
      this.setStation(this.station);
    }
  }

  onFrameRendered() {
    if (
      this.instrumentation === null ||
      this.station === null ||
      !this.audioBridge.started
    ) {
      this.wasActive = false;
      return;
    }
    // While inactive the cursor stood still as the clock ran on, so the events
    // that elapsed meanwhile would now fire at once. Skip past them on resuming.
    if (!this.wasActive) {
      this.#resync();
      this.wasActive = true;
    }
    const audioNow = this.audioBridge.currentTime;
    const hiddenGroups = this.panel.hiddenTransportGroups();
    this.#scheduleUpcoming(audioNow, hiddenGroups);
    this.#advanceDwellVoices(audioNow, hiddenGroups);
  }

  async #ensureAudio() {
    await this.audioBridge.start();
    if (this.instrumentation) {
      await this.audioBridge.warmUp(this.#sources());
    }
  }

  #sources() {
    return this.instrumentation.sources();
  }

  #resync() {
    this.cursor = cursorAtOrAfter(this.events, this.timeModel.current);
    this.lastSimTime = this.timeModel.current;
    this.lastSeekGeneration = this.timeModel.seekGeneration;
    this.dwellVoices = [];
  }

  // A scrub bumps the seek generation; the loop wrap steps time backwards; a
  // rendering stall leaps the clock far forward in one frame. Either way the
  // cursor and dwell voices belong to a timeline the lookahead can no longer
  // bridge, so we treat it as a jump and resync.
  #timelineJumped(simTime, timeScale) {
    const realSecondsSinceLastFrame = (simTime - this.lastSimTime) / timeScale;
    return (
      this.timeModel.seekGeneration !== this.lastSeekGeneration ||
      simTime < this.lastSimTime ||
      realSecondsSinceLastFrame > STALL_RESYNC_SECONDS
    );
  }

  #scheduleUpcoming(audioNow, hiddenGroups) {
    const simTime = this.timeModel.current;
    const timeScale = this.timeModel.tempo;
    if (this.#timelineJumped(simTime, timeScale)) {
      this.#resync();
    }
    this.lastSimTime = simTime;

    const horizon = simTime + LOOKAHEAD_SECONDS * timeScale;
    this.recentVoiceTimes = this.recentVoiceTimes.filter(
      (time) => time > audioNow - LOOKAHEAD_SECONDS,
    );

    const { due, cursor } = eventsInLookahead(
      this.events,
      this.cursor,
      horizon,
    );
    this.cursor = cursor;
    due.forEach((event) => {
      const group = groupOf(event.category);
      if (!passesMuteFilter(group, hiddenGroups)) {
        return;
      }
      const delaySeconds = Math.max(0, (event.time - simTime) / timeScale);
      const soundTime = audioNow + delaySeconds;
      if (
        !passesGroupGap(
          soundTime,
          this.lastTimeByGroup.get(group),
          MINIMUM_GROUP_GAP_SECONDS,
        )
      ) {
        return;
      }
      if (
        !passesVoiceBudget(
          this.recentVoiceTimes.length,
          MAXIMUM_VOICES_PER_WINDOW,
          dropPriorityOf(group),
        )
      ) {
        return;
      }
      this.lastTimeByGroup.set(group, soundTime);
      this.recentVoiceTimes.push(soundTime);
      this.#playEvent(event, group, audioNow + delaySeconds, timeScale);
    });
  }

  #playEvent(event, group, startAudio, timeScale) {
    const { parameters, durationSeconds } = this.instrumentation.parametersFor(
      group,
      event.kind,
    );
    this.audioBridge.play(
      { ...parameters, gain: this.#dampedGain(parameters.gain) },
      startAudio,
      durationSeconds,
    );
    if (
      event.kind === 'arrival' &&
      event.dwellSeconds >= DWELL_MINIMUM_SECONDS
    ) {
      this.#startDwellVoice(group, event, startAudio, timeScale);
    }
  }

  #startDwellVoice(group, event, startAudio, timeScale) {
    const figure = this.instrumentation.dwellFigureFor(group);
    if (figure === null) {
      return;
    }
    this.dwellVoices.push({
      ...figure,
      group,
      startAudio,
      endAudio: startAudio + event.dwellSeconds / timeScale,
      hitsPlayed: 0,
    });
  }

  #advanceDwellVoices(audioNow, hiddenGroups) {
    const horizon = audioNow + LOOKAHEAD_SECONDS;
    this.dwellVoices = this.dwellVoices.filter((voice) => {
      if (!passesMuteFilter(voice.group, hiddenGroups)) {
        return false;
      }
      const until = Math.min(horizon, voice.endAudio);
      this.#scheduleDwellHits(voice, until, audioNow);
      return until < voice.endAudio;
    });
  }

  #scheduleDwellHits(voice, until, audioNow) {
    const due = this.#dwellHitsBefore(voice, until);
    due.forEach((hitStart) => {
      this.audioBridge.play(
        { ...voice.parameters, gain: this.#dampedGain(voice.parameters.gain) },
        Math.max(audioNow, hitStart),
        voice.durationSeconds,
      );
    });
    voice.hitsPlayed += due.length;
  }

  // The window includes its start and excludes its end, so back-to-back windows
  // neither drop nor double a hit. A figure struck once has nothing after its
  // first hit.
  #dwellHitsBefore(voice, until) {
    if (voice.intervalSeconds === null) {
      return voice.hitsPlayed === 0 && voice.startAudio < until
        ? [voice.startAudio]
        : [];
    }
    const dueCount = Math.ceil(
      (until - voice.startAudio) / voice.intervalSeconds,
    );
    return Array.from(
      { length: Math.max(0, dueCount - voice.hitsPlayed) },
      (_, offset) =>
        voice.startAudio + (voice.hitsPlayed + offset) * voice.intervalSeconds,
    );
  }

  #dampedGain(gain) {
    return (
      (gain ?? DEFAULT_GAIN) *
      MASTER_GAIN *
      gainDampingForDensity(
        this.recentVoiceTimes.length,
        DENSITY_DAMPING_VOICES,
      )
    );
  }
}
