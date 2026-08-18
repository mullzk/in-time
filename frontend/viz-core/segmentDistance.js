// How far a point lies from a line segment -- what a pointer needs to know to
// pick the leg it hovers over. Squared, because picking only ever compares
// distances and the square root would be thrown away.
export function distanceToSegmentSquared(
  pointX,
  pointY,
  fromX,
  fromY,
  toX,
  toY,
) {
  const alongX = toX - fromX;
  const alongY = toY - fromY;
  const lengthSquared = alongX * alongX + alongY * alongY;
  const howFarAlong =
    lengthSquared === 0
      ? 0
      : Math.min(
          1,
          Math.max(
            0,
            ((pointX - fromX) * alongX + (pointY - fromY) * alongY) /
              lengthSquared,
          ),
        );
  const nearestX = fromX + howFarAlong * alongX;
  const nearestY = fromY + howFarAlong * alongY;
  return (pointX - nearestX) ** 2 + (pointY - nearestY) ** 2;
}
