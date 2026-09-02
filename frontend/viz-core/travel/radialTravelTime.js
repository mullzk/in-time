// Where a station belongs in the travel-time picture: in the direction it truly
// lies, at the distance the journey there takes.

// Turns a second of travel into a world distance; ten metres a second puts the
// picture at the scale of a 36 km/h journey.
export const WORLD_METRES_PER_TRAVEL_SECOND = 10;

// A stop that shares the centre's coordinate has no direction of its own; it is
// drawn due east, so it keeps its distance instead of collapsing onto the
// centre.
const directionFrom = (centre, station) => {
  const east = station.east - centre.east;
  const north = station.north - centre.north;
  const length = Math.hypot(east, north);
  return length === 0 ? [1, 0] : [east / length, north / length];
};

export class RadialTravelTimeLayout {
  constructor(
    centre,
    { worldMetresPerTravelSecond = WORLD_METRES_PER_TRAVEL_SECOND } = {},
  ) {
    this.centre = centre;
    this.worldMetresPerTravelSecond = worldMetresPerTravelSecond;
  }

  positionOf(station, travelTimeSeconds) {
    const [towardsEast, towardsNorth] = directionFrom(this.centre, station);
    const radius = travelTimeSeconds * this.worldMetresPerTravelSecond;
    return [
      this.centre.east + towardsEast * radius,
      this.centre.north + towardsNorth * radius,
    ];
  }
}
