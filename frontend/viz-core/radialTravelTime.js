// Where a station belongs in the travel-time picture: in the direction it truly
// lies, at the distance the journey there takes. The country stays recognisable
// while the timetable stretches and shrinks it -- a corner an hour away sits as
// far out as a suburb an hour away.

// The scale that turns a second of travel into a world distance. At ten metres
// per second the whole picture reads as a journey at 36 km/h, so anything drawn
// closer than it lies is faster than that, anything further out is slower.
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
