// The wording of what the picture says when asked: how long something takes.

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

// A wait of nothing is worth saying so: it means one stays seated or steps
// straight across.
export function formatWait(seconds) {
  return seconds < 60 ? 'ohne Wartezeit' : `${formatDuration(seconds)} warten`;
}
