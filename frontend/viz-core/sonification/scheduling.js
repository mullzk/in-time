// Pure scheduling decisions lifted out of the audio loop so they can be tested
// without an audio clock: which display group a category belongs to, the mute
// and density rules that thin out a busy hub, and the cursor arithmetic that
// walks a time-sorted event list. The side-effecting Sonifier composes these.

// Display groups in drop-priority order: when more sounds compete than the
// voice budget allows, later groups are dropped first.
export const TRANSPORT_GROUPS = [
  'fernverkehr',
  'interregio',
  'regionalverkehr',
  'tram',
  'bus',
];

export const LOOKAHEAD_SECONDS = 0.15;
export const MINIMUM_GROUP_GAP_SECONDS = 0.04;
export const MAXIMUM_VOICES_PER_WINDOW = 24;
export const DENSITY_DAMPING_VOICES = 8;
export const DWELL_MINIMUM_SECONDS = 60;

const GROUP_BY_CATEGORY = new Map([
  [0, 'fernverkehr'],
  [1, 'interregio'],
  [2, 'regionalverkehr'],
  [3, 'regionalverkehr'],
  [4, 'regionalverkehr'],
  [5, 'tram'],
  [6, 'bus'],
]);

export function groupOf(category) {
  return GROUP_BY_CATEGORY.get(category) ?? 'regionalverkehr';
}

export function dropPriorityOf(group) {
  return TRANSPORT_GROUPS.indexOf(group);
}

export function passesMuteFilter(group, hiddenGroups) {
  return !hiddenGroups.includes(group);
}

export function passesGroupGap(soundTime, lastGroupTime, minGap) {
  return lastGroupTime === undefined || soundTime - lastGroupTime >= minGap;
}

// The top-priority group always plays; every other group yields once the window
// is full.
export function passesVoiceBudget(recentVoiceCount, maxVoices, dropPriority) {
  return recentVoiceCount < maxVoices || dropPriority === 0;
}

export function gainDampingForDensity(recentVoiceCount, dampVoices) {
  return Math.min(1, dampVoices / Math.max(1, recentVoiceCount));
}

export function cursorAtOrAfter(events, time) {
  let low = 0;
  let high = events.length;
  while (low < high) {
    const mid = (low + high) >> 1;
    if (events[mid].time < time) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }
  return low;
}

export function eventsInLookahead(events, cursor, horizon) {
  let next = cursor;
  const due = [];
  while (next < events.length && events[next].time <= horizon) {
    due.push(events[next]);
    next += 1;
  }
  return { due, cursor: next };
}
