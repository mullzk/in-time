// Every leg of every trip of a service day, in departure order: the one input a
// connection scan reads. Trips arrive per network (rail and road are separate
// blobs with separate station numbering), so the list also holds the shared
// station space the scan works in -- one place per didok, however many networks
// serve it.
//
// A Swiss day carries some 2.3 million legs, so they are counted once and then
// written straight into the columns. Collecting them as objects in between costs
// half a gigabyte for a picture that is thrown away immediately.

// A service day runs past midnight, so departure seconds reach beyond 24 h --
// 33 h on a real day. Twice a day is the ceiling the counting sort allocates
// for; a departure beyond it means the times are not what we think they are.
const SECONDS_PAST_MIDNIGHT_LIMIT = 48 * 3600;

class StationSpace {
  constructor() {
    this.didoks = [];
    this._indexByDidok = new Map();
    this._clusterOfIndex = [];
  }

  // The cluster a stop belongs to is its interchange, named by a representative
  // didok. A catalog that knows it wins over one that leaves it out, whichever
  // network came first.
  place(didok, cluster) {
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

// A blob addresses its stations by its own indices; this turns them into places
// in the shared space. A station the catalog does not cover cannot be named, so
// the legs touching it are left out rather than pointing nowhere.
const stationPlacesOfNetwork = (stations, space) =>
  stations.map((station) => space.place(station.didok, station.cluster));

const firstTripOfEachNetwork = (networks) => {
  const firstTrips = [0];
  networks.forEach(({ trips }) => {
    firstTrips.push(firstTrips[firstTrips.length - 1] + trips.length);
  });
  return firstTrips;
};

// Walks the legs of every network in a fixed order, so counting them and writing
// them out see exactly the same sequence.
const forEachLeg = (networks, stationPlacesPerNetwork, visitLeg) => {
  const firstTrips = firstTripOfEachNetwork(networks);
  networks.forEach(({ trips }, networkIndex) => {
    const stationPlaces = stationPlacesPerNetwork[networkIndex];
    trips.forEach((trip, tripIndexInNetwork) => {
      trip.events.forEach((departingEvent, eventIndex) => {
        if (eventIndex === trip.events.length - 1) {
          return;
        }
        const arrivingEvent = trip.events[eventIndex + 1];
        const departureStation = stationPlaces[departingEvent.station];
        const arrivalStation = stationPlaces[arrivingEvent.station];
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

const countDeparturesPerSecond = (networks, stationPlacesPerNetwork) => {
  const departuresPerSecond = new Int32Array(SECONDS_PAST_MIDNIGHT_LIMIT);
  forEachLeg(networks, stationPlacesPerNetwork, ({ departureTime }) => {
    if (departureTime < 0 || departureTime >= SECONDS_PAST_MIDNIGHT_LIMIT) {
      throw new Error(
        `departure time outside the service day: ${departureTime}`,
      );
    }
    departuresPerSecond[departureTime] += 1;
  });
  return departuresPerSecond;
};

// Departure times are whole seconds inside a known span, so the order can be
// counted rather than compared -- a comparison sort of two million legs costs an
// order of magnitude more. Each second learns where its block of legs starts.
const firstSlotOfEachSecond = (departuresPerSecond) => {
  const firstSlots = new Int32Array(departuresPerSecond.length);
  departuresPerSecond.reduce((nextSlot, departures, second) => {
    firstSlots[second] = nextSlot;
    return nextSlot + departures;
  }, 0);
  return firstSlots;
};

const totalOf = (counts) => counts.reduce((sum, count) => sum + count, 0);

export class ConnectionList {
  constructor(columns, space, networkOfTrip, tripInNetwork, categoryOfTrip) {
    this.connectionCount = columns.departureStations.length;
    this.tripCount = networkOfTrip.length;
    this.departureStations = columns.departureStations;
    this.arrivalStations = columns.arrivalStations;
    this.departureTimes = columns.departureTimes;
    this.arrivalTimes = columns.arrivalTimes;
    this.trips = columns.trips;
    this.events = columns.events;
    this._space = space;
    this._siblingsPerStation = space.siblingsPerStation();
    this._networkOfTrip = networkOfTrip;
    this._tripInNetwork = tripInNetwork;
    this._categoryOfTrip = categoryOfTrip;
  }

  get stationCount() {
    return this._space.didoks.length;
  }

  didokOf(stationIndex) {
    return this._space.didoks[stationIndex];
  }

  stationOf(didok) {
    return this._space.indexOf(didok);
  }

  networkOfTrip(trip) {
    return this._networkOfTrip[trip];
  }

  tripInNetwork(trip) {
    return this._tripInNetwork[trip];
  }

  // Which kind of vehicle runs the trip, in the blob's categories: a drawing may
  // tell an InterRegio from a bus without going back to the trips.
  categoryOfTrip(trip) {
    return this._categoryOfTrip[trip];
  }

  // The other stops of the same interchange -- the only places a scan may change
  // vehicles besides the stop it arrived at.
  clusterSiblingsOf(stationIndex) {
    return this._siblingsPerStation[stationIndex];
  }

  // The interchange a stop belongs to, named by its representative didok, or
  // null for a stop that stands alone. Whoever shows an interchange as one place
  // groups by this.
  clusterOf(stationIndex) {
    return this._space.clusterOfStation(stationIndex);
  }

  // The columns carry the scan; this is for readers that want one connection as
  // a whole -- tests, and the panels walking a path back to its start.
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

const columnsInDepartureOrder = (
  networks,
  stationPlacesPerNetwork,
  connectionCount,
  nextSlotOfSecond,
) => {
  const columns = {
    departureStations: new Int32Array(connectionCount),
    arrivalStations: new Int32Array(connectionCount),
    departureTimes: new Int32Array(connectionCount),
    arrivalTimes: new Int32Array(connectionCount),
    trips: new Int32Array(connectionCount),
    events: new Int32Array(connectionCount),
  };
  forEachLeg(networks, stationPlacesPerNetwork, (leg) => {
    const slot = nextSlotOfSecond[leg.departureTime];
    nextSlotOfSecond[leg.departureTime] += 1;
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
  const space = new StationSpace();
  const stationPlacesPerNetwork = networks.map(({ stations }) =>
    stationPlacesOfNetwork(stations, space),
  );
  const departuresPerSecond = countDeparturesPerSecond(
    networks,
    stationPlacesPerNetwork,
  );
  return new ConnectionList(
    columnsInDepartureOrder(
      networks,
      stationPlacesPerNetwork,
      totalOf(departuresPerSecond),
      firstSlotOfEachSecond(departuresPerSecond),
    ),
    space,
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
