// The pulse of the long-distance network: how many of its trains stand at a
// station at this moment. The count follows the schedule, eases towards its
// target so a node swells and fades instead of blinking, and enters as its
// square root so the large interchanges do not dwarf every other stop.

// A dwell the schedule records as instantaneous would never be seen, so every
// presence is held at least this long.
const MINIMUM_PRESENCE_SECONDS = 90;
// Share of the remaining gap to the current count closed per second.
const EASING_PER_SECOND = 6;
const FADED_OUT_BELOW = 0.02;

const presencesOfTrip = (trip) =>
  trip.events.map((event) => ({
    station: event.station,
    from: event.arr,
    to: Math.max(event.dep, event.arr + MINIMUM_PRESENCE_SECONDS),
  }));

const groupPresencesByStation = (trips, longDistanceCategories) => {
  const byStation = new Map();
  trips
    .filter((trip) => longDistanceCategories.has(trip.category))
    .flatMap(presencesOfTrip)
    .forEach(({ station, from, to }) => {
      const presences = byStation.get(station);
      if (presences) {
        presences.push([from, to]);
      } else {
        byStation.set(station, [[from, to]]);
      }
    });
  return byStation;
};

const presentCount = (presences, t) =>
  presences.filter(([from, to]) => t >= from && t <= to).length;

export class LongDistancePulse {
  // `longDistanceCategories` is a Set of the blob trip categories that count as
  // long-distance; `stationPoints` indexes [east, north] the way trip events do.
  constructor(trips, stationPoints, longDistanceCategories) {
    this.stationPoints = stationPoints;
    this.presencesByStation = groupPresencesByStation(
      trips,
      longDistanceCategories,
    );
    this.intensityByStation = new Map(
      [...this.presencesByStation.keys()].map((station) => [station, 0]),
    );
  }

  update(currentTimeSeconds, deltaSeconds) {
    const easing = Math.min(1, EASING_PER_SECOND * deltaSeconds);
    this.presencesByStation.forEach((presences, station) => {
      const target = Math.sqrt(presentCount(presences, currentTimeSeconds));
      const intensity = this.intensityByStation.get(station);
      this.intensityByStation.set(
        station,
        intensity + (target - intensity) * easing,
      );
    });
  }

  // The nodes worth drawing, with the eased intensity that sets their size and
  // colour; stations that have faded back out drop away.
  visiblePulses() {
    return [...this.intensityByStation]
      .filter(([, intensity]) => intensity >= FADED_OUT_BELOW)
      .map(([station, intensity]) => {
        const [east, north] = this.stationPoints[station];
        return { east, north, intensity };
      });
  }
}
