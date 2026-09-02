// Minutes up to an hour, hours and minutes beyond that; anything under a
// minute is still called a minute.
export function formatDuration(seconds) {
  const minutes = Math.max(1, Math.round(seconds / 60));
  if (minutes < 60) {
    return `${minutes} min`;
  }
  const remainder = minutes % 60;
  const hours = (minutes - remainder) / 60;
  return remainder === 0 ? `${hours} h` : `${hours} h ${remainder} min`;
}

export function formatRideWithWait(rideSeconds, waitSeconds) {
  const ride = formatDuration(rideSeconds);
  return waitSeconds < 60
    ? ride
    : `${ride} (+${formatDuration(waitSeconds)} Wartezeit)`;
}

export function formatTravelTimeFrom(seconds, startName) {
  return `${formatDuration(seconds)} ab ${startName}`;
}
