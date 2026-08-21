import { stationMatchingSlug } from './stationInUrl.js';

// Nobody is shown an empty canvas: without a station chosen, a panel sets off
// from wherever in the country, and whoever looks searches on from there.

// A stop nothing leaves from at this hour would be a picture of a single dot, so
// the walk carries on from the drawn stop until it finds one that travels. It
// gives up after a handful of tries -- at a quiet hour a whole walk of scans
// would cost more than the plainer picture is worth.
const ATTEMPTS = 10;

export function drawnStationThatTravels(
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

export function stationToTravelFrom(
  catalog,
  connections,
  scan,
  startTimeSeconds,
) {
  const served = catalog.entries.filter(
    (entry) => connections.stationOf(entry.didok) !== undefined,
  );
  const travelsAnywhere = (entry) =>
    scan
      .from(connections.stationOf(entry.didok), startTimeSeconds)
      .connections().length > 0;
  return drawnStationThatTravels(served, travelsAnywhere);
}

// Where a view sets off from until somebody picks a station on it. The address
// may name the stop, and the answer to a name is worth waiting for: a stop lives
// in a schedule that may still be on its way, and a picture of a stop nobody
// asked for would only have to be taken back. An address naming nothing is
// answered at once, by drawing a stop that travels.
export class StartStationChoice {
  constructor(addressedSlug = null) {
    this.addressedSlug = addressedSlug;
    this.station = null;
    this.drawnByThePanel = false;
    this.moreScheduleIsComing = true;
  }

  choose(station) {
    this.station = station;
    this.drawnByThePanel = false;
    return station;
  }

  noFurtherScheduleIsComing() {
    this.moreScheduleIsComing = false;
  }

  // Made again with every schedule that arrives, until it rests on a station
  // nobody has to take back: what the address names beats what the panel drew
  // for itself, and while the name may yet be answered, nothing is drawn at all.
  settleOn(catalog, connections, scan, startTimeSeconds) {
    if (this.station !== null && !this.drawnByThePanel) {
      return this.station;
    }
    const addressed = this.#addressedStationServedBy(catalog, connections);
    if (addressed !== null) {
      return this.choose(addressed);
    }
    if (this.addressedSlug !== null && this.moreScheduleIsComing) {
      this.station = null;
      return null;
    }
    if (this.station === null) {
      this.station = stationToTravelFrom(
        catalog,
        connections,
        scan,
        startTimeSeconds,
      );
      this.drawnByThePanel = this.station !== null;
    }
    return this.station;
  }

  // A stop the timetable does not serve is as good as unknown -- the picture
  // from it would be a single dot -- so the name waits for a schedule that does
  // serve it.
  #addressedStationServedBy(catalog, connections) {
    if (this.addressedSlug === null) {
      return null;
    }
    const addressed = stationMatchingSlug(catalog.entries, this.addressedSlug);
    if (addressed === null) {
      return null;
    }
    return connections.stationOf(addressed.didok) === undefined
      ? null
      : addressed;
  }
}
