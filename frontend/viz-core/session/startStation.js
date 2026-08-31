import { stationMatchingSlug } from './stationInUrl.js';

// A stop nothing leaves from at this hour would be a picture of a single dot,
// so drawing carries on until it finds one that travels -- but only for a
// handful of tries, since every try costs a scan.
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

// Where a view sets off from until somebody picks a station on it. A stop the
// address names may live in a schedule that is still on its way, so the choice
// waits for it rather than drawing a picture that would be taken back. A view
// that draws on its own answers an address naming nothing by drawing a stop
// that travels; one that does not rests at no station until somebody names one.
export class StartStationChoice {
  constructor(addressedSlug = null, { drawsOnItsOwn = true } = {}) {
    this.addressedSlug = addressedSlug;
    this.drawsOnItsOwn = drawsOnItsOwn;
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

  // Made again with every schedule that arrives: what the address names beats
  // what the panel drew for itself, and while the name may yet be answered by a
  // schedule still on its way, nothing is drawn at all.
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
    if (this.station === null && this.drawsOnItsOwn) {
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

  // A stop no loaded schedule serves counts as unknown, so the name waits for a
  // schedule that does serve it.
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
