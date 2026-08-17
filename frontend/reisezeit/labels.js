// The wording of what the picture says when asked: durations and the kind of
// vehicle behind a leg.

const CATEGORY_LABELS = [
  'Fernverkehr',
  'InterRegio',
  'Regio',
  'S-Bahn',
  'Bahn',
  'Tram',
  'Bus',
];

export const categoryLabel = (category) => CATEGORY_LABELS[category] ?? 'Fahrt';

// Minutes while they still read as minutes, hours and minutes beyond that. Under
// a minute is called a minute rather than nothing, since a leg always takes some
// time.
export function formatDuration(seconds) {
  const minutes = Math.max(1, Math.round(seconds / 60));
  if (minutes < 60) {
    return `${minutes} min`;
  }
  const remainder = minutes % 60;
  const hours = (minutes - remainder) / 60;
  return remainder === 0 ? `${hours} h` : `${hours} h ${remainder} min`;
}

// An operating day runs past midnight, the clock on the wall does not.
export function formatTimeOfDay(seconds) {
  const minutes = Math.floor(seconds / 60);
  const hour = Math.floor(minutes / 60) % 24;
  return `${String(hour).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

// A wait of nothing is worth saying so: it means one stays seated or steps
// straight across.
export function formatWait(seconds) {
  return seconds < 60 ? 'ohne Wartezeit' : `${formatDuration(seconds)} warten`;
}
