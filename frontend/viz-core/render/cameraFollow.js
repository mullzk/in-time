export const FOLLOW_HALF_LIFE_SECONDS = 0.8;

// The offset between centre and target travels with the target from where it
// was to where it is, so a moving target never lags behind, and the offset
// itself halves every half-life, so an off-centre target glides into the middle
// at any frame rate.
export function followedCentre(centre, previousTarget, target, deltaSeconds) {
  const remainingOffset = 2 ** (-deltaSeconds / FOLLOW_HALF_LIFE_SECONDS);
  return {
    east: target.east + (centre.east - previousTarget.east) * remainingOffset,
    north:
      target.north + (centre.north - previousTarget.north) * remainingOffset,
  };
}
