// Every sound an instrumentation may name, under the name a document uses. The
// name is ours, not the audio engine's: whoever writes a document should not
// have to know which soundfont or sample bank stands behind "marimba". This list
// is also what the vendoring script reads, so a sound the app offers is a sound
// it has.

import { bassDrum } from './bassDrum.js';
import { closedHihat } from './closedHihat.js';
import { filteredSawtooth } from './filteredSawtooth.js';
import { fmBell } from './fmBell.js';
import { highTom } from './highTom.js';
import { lowTom } from './lowTom.js';
import { marimba } from './marimba.js';
import { midTom } from './midTom.js';
import { mutedGuitar } from './mutedGuitar.js';
import { noiseBrush } from './noiseBrush.js';
import { openHihat } from './openHihat.js';
import { rideCymbal } from './rideCymbal.js';
import { rimshot } from './rimshot.js';
import { snare } from './snare.js';

const SOUNDS = [
  fmBell,
  filteredSawtooth,
  noiseBrush,
  mutedGuitar,
  marimba,
  bassDrum,
  snare,
  lowTom,
  midTom,
  highTom,
  rideCymbal,
  closedHihat,
  openHihat,
  rimshot,
];

const SOUND_BY_NAME = new Map(SOUNDS.map((sound) => [sound.name, sound]));

export function soundNamed(name) {
  return SOUND_BY_NAME.get(name) ?? null;
}

export function allSounds() {
  return [...SOUNDS];
}
