// The one side-effecting layer over the vendored superdough engine. It starts
// the audio context on a user gesture, points the soundfont and sample loaders
// at our own origin, warms up each sound source so its first real hit is not
// skipped, and plays one-shots. Everything above it (SonificationEngine, sound
// types, the Sonifier's scheduling) is pure and unaware of the Web Audio clock.

import {
  getAudioContext,
  initAudio,
  registerSoundfonts,
  registerSynthSounds,
  samples,
  setSoundfontUrl,
  superdough,
} from '../../vendor/superdough.js';

// Assets are served next to the vendored bundle, so their URLs resolve against
// this module's own location -- no build-time or deployment-specific base.
const vendorBase = new URL('../../vendor/', import.meta.url);
const SOUNDFONT_URL = new URL('soundfonts', vendorBase).href;
const DRUMKIT_MAP_URL = new URL(
  'samples/uzu-drumkit/uzu-drumkit.json',
  vendorBase,
).href;
const DRUMKIT_BASE_URL = new URL('samples/uzu-drumkit/', vendorBase).href;

const WARM_UP_ATTEMPTS = 20;
const WARM_UP_RETRY_MILLIS = 100;
const WARM_UP_LEAD_SECONDS = 0.25;

const delay = (millis) =>
  new Promise((resolve) => {
    setTimeout(resolve, millis);
  });

export class AudioBridge {
  constructor() {
    this.started = false;
    this.warmedSources = new Set();
  }

  // Must run inside a user gesture (autoplay policy). Idempotent: the first call
  // builds the context and registers every sound source once.
  async start() {
    if (this.started) {
      await this.context.resume();
      return;
    }
    await initAudio();
    this.context = getAudioContext();
    await this.context.resume();
    registerSynthSounds();
    setSoundfontUrl(SOUNDFONT_URL);
    await registerSoundfonts();
    await samples(DRUMKIT_MAP_URL, DRUMKIT_BASE_URL);
    this.started = true;
  }

  get currentTime() {
    return this.context.currentTime;
  }

  // The deadline is absolute context time; a past deadline is silently skipped
  // by superdough, which suits a scheduler that drops rather than delays.
  play(parameters, deadline, durationSeconds) {
    return superdough(parameters, deadline, durationSeconds);
  }

  // Streams each source once so its first audible hit is not lost to the load.
  // Soundfont and sample sources fetch on first use; synth sources are cheap.
  async warmUp(sources) {
    for (const source of sources) {
      if (!this.warmedSources.has(source)) {
        await this.#warmUpSource(source);
        this.warmedSources.add(source);
      }
    }
  }

  async #warmUpSource(source) {
    const probe = {
      s: source,
      note: 60,
      gain: 0.0001,
      pan: 0.5,
      attack: 0.002,
      decay: 0.05,
      sustain: 0.1,
      release: 0.1,
    };
    for (let attempt = 0; attempt < WARM_UP_ATTEMPTS; attempt += 1) {
      try {
        await this.play(probe, this.currentTime + WARM_UP_LEAD_SECONDS, 0.02);
        return;
      } catch {
        await delay(WARM_UP_RETRY_MILLIS);
      }
    }
  }
}
