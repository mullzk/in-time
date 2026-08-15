// An instrumentation is a document: which sound each transport group uses and
// how its four events differ. This class checks such a document once and then
// answers, for a group and an event, the parameters the audio engine needs.
//
// A value is looked up along five layers -- the kind of sound, the sound itself,
// the document, the transport group, the event -- and the deepest mention wins,
// relative values included. `noteAdjust` and `gainFactor` then apply to the
// absolute value they found: note plus semitones, gain times factor.

import { TRANSPORT_GROUPS } from './scheduling.js';
import { KINDS, PAN_BY_SIDE } from './sounds/kinds.js';
import { soundNamed } from './sounds/registry.js';

const EVENT_KINDS = ['arrival', 'departure', 'passthrough', 'dwell'];
const DWELL_TYPES = ['none', 'once', 'repeat'];

const DEFAULT_DURATION_SECONDS = 0.2;

// Keys that steer the resolution instead of describing a sound; they never reach
// the audio engine.
const STEERING_KEYS = ['instrumentation', 'sound', 'dwellType'];
const DERIVED_KEYS = [
  'noteAdjust',
  'gainFactor',
  'duration',
  'intervalSeconds',
];

const isBlock = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const soundParameters = (block) =>
  Object.fromEntries(
    Object.entries(block).filter(
      ([key, value]) => !STEERING_KEYS.includes(key) && !isBlock(value),
    ),
  );

const panValue = (pan) =>
  typeof pan === 'string' ? (PAN_BY_SIDE[pan] ?? Number(pan)) : pan;

class DocumentError extends Error {}

const fail = (message) => {
  throw new DocumentError(message);
};

const checkedSound = (name, where) =>
  soundNamed(name) ?? fail(`Unbekannter Sound "${name}" in ${where}`);

function checkDocument(document) {
  if (typeof document.instrumentation !== 'string') {
    fail('Dem Dokument fehlt der Name unter "instrumentation"');
  }
  if (document.sound === undefined) {
    fail(`"${document.instrumentation}" nennt keinen Sound`);
  }
  checkedSound(document.sound, 'der Wurzel');
  checkDwellType(document.dwellType, 'der Wurzel');
  Object.entries(document).forEach(([key, value]) => {
    if (!isBlock(value)) {
      return;
    }
    if (!TRANSPORT_GROUPS.includes(key)) {
      fail(`Unbekannter Verkehrsträger "${key}"`);
    }
    checkGroupBlock(value, key);
  });
}

function checkGroupBlock(block, group) {
  if (block.sound !== undefined) {
    checkedSound(block.sound, `"${group}"`);
  }
  checkDwellType(block.dwellType, `"${group}"`);
  Object.entries(block).forEach(([key, value]) => {
    if (!isBlock(value)) {
      return;
    }
    if (!EVENT_KINDS.includes(key)) {
      fail(`Unbekanntes Ereignis "${key}" in "${group}"`);
    }
    if (value.sound !== undefined) {
      checkedSound(value.sound, `"${group}" / "${key}"`);
    }
    Object.entries(value).forEach(([leafKey, leafValue]) => {
      if (isBlock(leafValue)) {
        fail(`"${group}" / "${key}" / "${leafKey}" ist keine Klangangabe`);
      }
    });
  });
}

function checkDwellType(dwellType, where) {
  if (dwellType !== undefined && !DWELL_TYPES.includes(dwellType)) {
    fail(`Unbekannter dwellType "${dwellType}" in ${where}`);
  }
}

export class Instrumentation {
  static fromDocument(document) {
    checkDocument(document);
    const instrumentation = new Instrumentation(document);
    instrumentation.#checkEveryGroupPlays();
    return instrumentation;
  }

  constructor(document) {
    this.document = document;
    this.name = document.instrumentation;
  }

  parametersFor(group, eventKind) {
    const resolved = this.#resolve(group, eventKind);
    return {
      durationSeconds: resolved.duration ?? DEFAULT_DURATION_SECONDS,
      parameters: audibleParameters(resolved),
    };
  }

  dwellFigureFor(group) {
    const dwellType = this.#dwellTypeFor(group);
    if (dwellType === 'none') {
      return null;
    }
    const resolved = this.#resolve(group, 'dwell');
    const repeats = dwellType === 'repeat';
    return {
      intervalSeconds: repeats ? resolved.intervalSeconds : null,
      durationSeconds: this.#dwellHitSeconds(group, resolved, repeats),
      parameters: audibleParameters(resolved),
    };
  }

  // Every sound the document can reach, so the audio bridge can stream each one
  // before its first audible hit.
  sources() {
    const sources = TRANSPORT_GROUPS.flatMap((group) =>
      EVENT_KINDS.map((eventKind) => this.#soundFor(group, eventKind).base.s),
    );
    return [...new Set(sources)];
  }

  // A hit lasts as long as the gap to the next one; only a duration in the dwell
  // block itself overrules that, because an inherited one belongs to the single
  // strike, not to the repetition.
  #dwellHitSeconds(group, resolved, repeats) {
    const stated = this.#eventBlock(group, 'dwell').duration;
    if (stated !== undefined) {
      return stated;
    }
    return repeats
      ? resolved.intervalSeconds
      : (resolved.duration ?? DEFAULT_DURATION_SECONDS);
  }

  #dwellTypeFor(group) {
    return (
      this.#groupBlock(group).dwellType ??
      this.document.dwellType ??
      KINDS[this.#soundFor(group, 'dwell').kind].dwellType
    );
  }

  #groupBlock(group) {
    return this.document[group] ?? {};
  }

  #eventBlock(group, eventKind) {
    return this.#groupBlock(group)[eventKind] ?? {};
  }

  #soundFor(group, eventKind) {
    const name =
      this.#eventBlock(group, eventKind).sound ??
      this.#groupBlock(group).sound ??
      this.document.sound;
    return soundNamed(name);
  }

  #resolve(group, eventKind) {
    const sound = this.#soundFor(group, eventKind);
    const kind = KINDS[sound.kind];
    return Object.assign(
      {},
      sound.base,
      kind.events[eventKind],
      sound.events?.[eventKind] ?? {},
      soundParameters(this.document),
      soundParameters(this.#groupBlock(group)),
      soundParameters(this.#eventBlock(group, eventKind)),
    );
  }

  // A repeating figure without a gap between its hits would schedule endlessly,
  // so it is refused at the door rather than at the first standing train.
  #checkEveryGroupPlays() {
    TRANSPORT_GROUPS.forEach((group) => {
      if (this.#dwellTypeFor(group) !== 'repeat') {
        return;
      }
      const { intervalSeconds } = this.#resolve(group, 'dwell');
      if (!(intervalSeconds > 0)) {
        fail(`"${group}" wiederholt im Stand ohne intervalSeconds > 0`);
      }
    });
  }
}

function audibleParameters(resolved) {
  const parameters = Object.fromEntries(
    Object.entries(resolved).filter(([key]) => !DERIVED_KEYS.includes(key)),
  );
  if (parameters.note !== undefined && resolved.noteAdjust !== undefined) {
    parameters.note += resolved.noteAdjust;
  }
  if (parameters.gain !== undefined && resolved.gainFactor !== undefined) {
    parameters.gain *= resolved.gainFactor;
  }
  if (parameters.pan !== undefined) {
    parameters.pan = panValue(parameters.pan);
  }
  return parameters;
}
