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

// A leg one boards carries the wait it cost, since the two together are what
// the leg takes out of the day. A leg without one says nothing about waiting:
// there was no change of vehicle to wait through.
export function formatRideWithWait(rideSeconds, waitSeconds) {
  const ride = formatDuration(rideSeconds);
  return waitSeconds < 60
    ? ride
    : `${ride} (+${formatDuration(waitSeconds)} Wartezeit)`;
}

// How far out a place lies, told as the journey to it. The starting point is
// named, since that is what the number is counted from.
export function formatTravelTimeFrom(seconds, startName) {
  return `${formatDuration(seconds)} ab ${startName}`;
}
