// Nobody is shown an empty canvas: without a station chosen, a panel sets off
// from wherever in the country, and whoever looks searches on from there.

// A stop nothing leaves from at this hour would be a picture of a single dot, so
// the walk carries on from the drawn stop until it finds one that travels. It
// gives up after a handful of tries -- at a quiet hour a whole walk of scans
// would cost more than the plainer picture is worth.
const ATTEMPTS = 10;

export function stationToTravelFrom(
  candidates,
  travelsAnywhere,
  random = Math.random,
) {
  if (candidates.length === 0) {
    return null;
  }
  const drawn = Math.floor(random() * candidates.length);
  const attempts = Array.from(
    { length: Math.min(candidates.length, ATTEMPTS) },
    (_, step) => candidates[(drawn + step) % candidates.length],
  );
  return attempts.find(travelsAnywhere) ?? attempts[0];
}
