// Every leg of every trip of a service day, in departure order: the one input a
// connection scan reads. Trips arrive per network (rail and road are separate
// blobs with separate station numbering), so the list also holds the shared
// station directory the scan works in -- one entry per didok, however many
// networks serve it.
//
// A Swiss day carries some 2.3 million legs, so they are counted once and then
// written straight into the columns. Collecting them as objects in between costs
// half a gigabyte for a picture that is thrown away immediately.

// A service day runs past midnight, so departure seconds reach beyond 24 h --
// 33 h on a real day. Twice a day is the ceiling the counting sort allocates
// for; a departure beyond it means the times are not what we think they are.
const SECONDS_PAST_MIDNIGHT_LIMIT = 48 * 3600;

class StationDirectory {
  constructor() {
    this.didoks = [];
    this._indexByDidok = new Map();
    this._clusterOfIndex = [];
  }

  // The cluster a stop belongs to is its interchange, named by a representative
  // didok. A catalog that knows it wins over one that leaves it out, whichever
  // network came first.
  enter(didok, cluster) {
    const known = this._indexByDidok.get(didok);
    if (known !== undefined) {
      if (this._clusterOfIndex[known] === null) {
        this._clusterOfIndex[known] = cluster ?? null;
      }
      return known;
    }
    const index = this.didoks.length;
    this.didoks.push(didok);
    this._indexByDidok.set(didok, index);
    this._clusterOfIndex.push(cluster ?? null);
    return index;
  }

  indexOf(didok) {
    return this._indexByDidok.get(didok);
  }

  clusterOfStation(index) {
    return this._clusterOfIndex[index];
  }

  // Every stop of an interchange, from the view of one of them: the others, in
  // station order. A stop that stands alone has none.
  siblingsPerStation() {
    const membersOfCluster = new Map();
    this._clusterOfIndex.forEach((cluster, index) => {
      if (cluster === null) {
        return;
      }
      const members = membersOfCluster.get(cluster) ?? [];
      members.push(index);
      membersOfCluster.set(cluster, members);
    });
    return this._clusterOfIndex.map((cluster, index) =>
      (membersOfCluster.get(cluster) ?? []).filter(
        (member) => member !== index,
      ),
    );
  }
}

// A blob addresses its stations by its own indices; this turns them into entries
// of the shared directory. A station the catalog does not cover cannot be named,
// so the legs touching it are left out rather than pointing nowhere.
const stationIndicesOfNetwork = (stations, stationDirectory) =>
  stations.map((station) =>
    stationDirectory.enter(station.didok, station.cluster),
  );

const firstTripOfEachNetwork = (networks) => {
  const firstTrips = [0];
  networks.forEach(({ trips }) => {
    firstTrips.push(firstTrips[firstTrips.length - 1] + trips.length);
  });
  return firstTrips;
};

// Walks the legs of every network in a fixed order, so counting them and writing
// them out see exactly the same sequence.
const forEachLeg = (networks, stationIndicesPerNetwork, visitLeg) => {
  const firstTrips = firstTripOfEachNetwork(networks);
  networks.forEach(({ trips }, networkIndex) => {
    const stationIndices = stationIndicesPerNetwork[networkIndex];
    trips.forEach((trip, tripIndexInNetwork) => {
      trip.events.forEach((departingEvent, eventIndex) => {
        if (eventIndex === trip.events.length - 1) {
          return;
        }
        const arrivingEvent = trip.events[eventIndex + 1];
        const departureStation = stationIndices[departingEvent.station];
        const arrivalStation = stationIndices[arrivingEvent.station];
        if (departureStation === undefined || arrivalStation === undefined) {
          return;
        }
        visitLeg({
          departureStation,
          departureTime: departingEvent.dep,
          arrivalStation,
          arrivalTime: arrivingEvent.arr,
          trip: firstTrips[networkIndex] + tripIndexInNetwork,
          event: eventIndex,
        });
      });
    });
  });
};

// How many legs depart in each second of the service day. Departure times are
// whole seconds inside a known span, so the order can be counted rather than
// compared -- a comparison sort of two million legs costs an order of magnitude
// more.
class DepartureCounts {
  constructor() {
    this._departuresPerSecond = new Int32Array(SECONDS_PAST_MIDNIGHT_LIMIT);
  }

  countDeparture(departureTime) {
    if (departureTime < 0 || departureTime >= SECONDS_PAST_MIDNIGHT_LIMIT) {
      throw new Error(
        `departure time outside the service day: ${departureTime}`,
      );
    }
    this._departuresPerSecond[departureTime] += 1;
  }

  // A second's block of slots begins where every earlier second's block ends,
  // so the running sum over the counts is already the writing order.
  slotsInDepartureOrder() {
    const firstSlotOfSecond = new Int32Array(this._departuresPerSecond.length);
    let slotsTaken = 0;
    this._departuresPerSecond.forEach((departures, second) => {
      firstSlotOfSecond[second] = slotsTaken;
      slotsTaken += departures;
    });
    return new DepartureOrderedSlots(firstSlotOfSecond, slotsTaken);
  }
}

// Hands out the position each leg is written to, one after another within its
// departure second. Every slot is handed out once, so the legs land in departure
// order without ever being sorted.
class DepartureOrderedSlots {
  constructor(nextSlotOfSecond, connectionCount) {
    this._nextSlotOfSecond = nextSlotOfSecond;
    this.connectionCount = connectionCount;
  }

  takeSlotFor(departureTime) {
    const slot = this._nextSlotOfSecond[departureTime];
    this._nextSlotOfSecond[departureTime] += 1;
    return slot;
  }
}

const departureCountsOf = (networks, stationIndicesPerNetwork) => {
  const counts = new DepartureCounts();
  forEachLeg(networks, stationIndicesPerNetwork, ({ departureTime }) =>
    counts.countDeparture(departureTime),
  );
  return counts;
};

export class ConnectionList {
  constructor(
    columns,
    stationDirectory,
    networkOfTrip,
    tripInNetwork,
    categoryOfTrip,
  ) {
    this.connectionCount = columns.departureStations.length;
    this.tripCount = networkOfTrip.length;
    this.departureStations = columns.departureStations;
    this.arrivalStations = columns.arrivalStations;
    this.departureTimes = columns.departureTimes;
    this.arrivalTimes = columns.arrivalTimes;
    this.trips = columns.trips;
    this.events = columns.events;
    this._stationDirectory = stationDirectory;
    this._siblingsPerStation = stationDirectory.siblingsPerStation();
    this._networkOfTrip = networkOfTrip;
    this._tripInNetwork = tripInNetwork;
    this._categoryOfTrip = categoryOfTrip;
  }

  get stationCount() {
    return this._stationDirectory.didoks.length;
  }

  didokOf(stationIndex) {
    return this._stationDirectory.didoks[stationIndex];
  }

  stationOf(didok) {
    return this._stationDirectory.indexOf(didok);
  }

  networkOfTrip(trip) {
    return this._networkOfTrip[trip];
  }

  tripInNetwork(trip) {
    return this._tripInNetwork[trip];
  }

  // Which kind of vehicle runs the trip, in the blob's categories.
  categoryOfTrip(trip) {
    return this._categoryOfTrip[trip];
  }

  // The other stops of the same interchange -- the only places a scan may change
  // vehicles besides the stop it arrived at.
  clusterSiblingsOf(stationIndex) {
    return this._siblingsPerStation[stationIndex];
  }

  // The interchange a stop belongs to, named by its representative didok, or
  // null for a stop that stands alone.
  clusterOf(stationIndex) {
    return this._stationDirectory.clusterOfStation(stationIndex);
  }

  // The columns carry the scan; this is for readers that want one connection as
  // a whole rather than a slice of every column.
  connectionAt(index) {
    return {
      departureStation: this.departureStations[index],
      departureTime: this.departureTimes[index],
      arrivalStation: this.arrivalStations[index],
      arrivalTime: this.arrivalTimes[index],
      trip: this.trips[index],
      event: this.events[index],
    };
  }
}

const columnsInDepartureOrder = (networks, stationIndicesPerNetwork, slots) => {
  const columns = {
    departureStations: new Int32Array(slots.connectionCount),
    arrivalStations: new Int32Array(slots.connectionCount),
    departureTimes: new Int32Array(slots.connectionCount),
    arrivalTimes: new Int32Array(slots.connectionCount),
    trips: new Int32Array(slots.connectionCount),
    events: new Int32Array(slots.connectionCount),
  };
  forEachLeg(networks, stationIndicesPerNetwork, (leg) => {
    const slot = slots.takeSlotFor(leg.departureTime);
    columns.departureStations[slot] = leg.departureStation;
    columns.arrivalStations[slot] = leg.arrivalStation;
    columns.departureTimes[slot] = leg.departureTime;
    columns.arrivalTimes[slot] = leg.arrivalTime;
    columns.trips[slot] = leg.trip;
    columns.events[slot] = leg.event;
  });
  return columns;
};

// `networks` are `{ trips, stations }` pairs: the trips a VehiclePositionEngine
// read from a blob, and the published station catalog in that blob's index
// order.
export function buildConnectionList(networks) {
  const stationDirectory = new StationDirectory();
  const stationIndicesPerNetwork = networks.map(({ stations }) =>
    stationIndicesOfNetwork(stations, stationDirectory),
  );
  const slots = departureCountsOf(
    networks,
    stationIndicesPerNetwork,
  ).slotsInDepartureOrder();
  return new ConnectionList(
    columnsInDepartureOrder(networks, stationIndicesPerNetwork, slots),
    stationDirectory,
    networks.flatMap(({ trips }, networkIndex) =>
      trips.map(() => networkIndex),
    ),
    networks.flatMap(({ trips }) =>
      trips.map((_, tripIndexInNetwork) => tripIndexInNetwork),
    ),
    Uint8Array.from(
      networks.flatMap(({ trips }) => trips.map((trip) => trip.category)),
    ),
  );
}
