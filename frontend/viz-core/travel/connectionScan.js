// The connection scan: one pass over the day's legs in departure order leaves,
// for every station, the earliest time one can be there and the connection one
// came on. Those connections are the reachability tree the panels draw.
//
// Two states per place, deliberately kept apart: when one *is* there, and when
// one may *leave* from there. They differ by the transfer time, which a change
// of vehicle costs but staying seated does not.

// Two minutes to change vehicles, at the arrival stop or anywhere in its
// interchange. An interchange counts as one place: its stops pass an arrival on
// to each other at no cost, and the transfer time is paid once, on boarding.
export const MINIMUM_TRANSFER_SECONDS = 120;

// Nobody stands two hours on a platform to get somewhere. A departure further
// away than this is not boarded, and whatever it alone would have opened up is
// not reached -- the picture shows where one travels to, not where one could end
// up after an evening on a bench. Sitting in a vehicle is not waiting, however
// long it stands.
export const MAXIMUM_WAIT_SECONDS = 2 * 3600;

const UNREACHED = Number.POSITIVE_INFINITY;
const NO_DEPARTURE_WINDOW = Number.NEGATIVE_INFINITY;
const NO_CONNECTION = -1;

const UNJUDGED = 0;
const WITHIN_THE_WAIT = 1;
const BEYOND_THE_WAIT = 2;

export class ReachabilityTree {
  constructor(
    list,
    startStation,
    startTime,
    arrivals,
    arrivedOn,
    boardedOn,
    maximumWaitSeconds = MAXIMUM_WAIT_SECONDS,
  ) {
    this._list = list;
    this._startStation = startStation;
    this._startTime = startTime;
    this._arrivals = arrivals;
    this._arrivedOn = arrivedOn;
    this._boardedOn = boardedOn;
    this.#forgetJourneysStandingAroundTooLong(maximumWaitSeconds);
  }

  // The scan watches the wait where it boards a vehicle, which need not be the
  // stop the journey is drawn from: a vehicle boarded further along its run
  // passes stops one could have been at hours earlier, and the journey the tree
  // then tells stands at such a stop all morning. Riding out and back to fill
  // those hours makes no difference to the day, so the stops behind such a wait
  // count as unreached -- which is what the maximum says in the first place.
  #forgetJourneysStandingAroundTooLong(maximumWaitSeconds) {
    const verdicts = new Uint8Array(this._arrivals.length);
    const tooLong = this.reachedStations().filter(
      (station) =>
        !this.#journeyStaysWithinTheWait(station, maximumWaitSeconds, verdicts),
    );
    tooLong.forEach((station) => {
      this._arrivals[station] = UNREACHED;
      this._arrivedOn[station] = NO_CONNECTION;
    });
  }

  // Every wait on the way, not just the last one: a stop behind an unbearable
  // wait is no better reached than the stop the wait stands at.
  #journeyStaysWithinTheWait(station, maximumWaitSeconds, verdicts) {
    if (verdicts[station] === UNJUDGED) {
      const leg = this.legInto(station);
      const stays =
        leg === null ||
        (this.waitBeforeLegInto(station) <= maximumWaitSeconds &&
          this.#journeyStaysWithinTheWait(
            leg.fromStation,
            maximumWaitSeconds,
            verdicts,
          ));
      verdicts[station] = stays ? WITHIN_THE_WAIT : BEYOND_THE_WAIT;
    }
    return verdicts[station] === WITHIN_THE_WAIT;
  }

  isReached(stationIndex) {
    return this._arrivals[stationIndex] !== UNREACHED;
  }

  arrivalAt(stationIndex) {
    return this.isReached(stationIndex) ? this._arrivals[stationIndex] : null;
  }

  travelTimeTo(stationIndex) {
    return this.isReached(stationIndex)
      ? this._arrivals[stationIndex] - this._startTime
      : null;
  }

  // The connection one arrived on, which also names where one came from -- the
  // edge of the tree that ends at this station.
  arrivedOn(stationIndex) {
    const connection = this._arrivedOn[stationIndex];
    return connection === NO_CONNECTION ? null : connection;
  }

  // The last stretch of the vehicle's own run: from the stop before to here.
  // That is the line on the ground, whatever brought one to that stop -- a
  // picture drawing anything else would leap over stops the vehicle calls at.
  legInto(stationIndex) {
    const arriving = this._arrivedOn[stationIndex];
    if (arriving === NO_CONNECTION) {
      return null;
    }
    return {
      fromStation: this._list.departureStations[arriving],
      departureTime: this._list.departureTimes[arriving],
      arrivalTime: this._list.arrivalTimes[arriving],
      trip: this._list.trips[arriving],
    };
  }

  // What one waits at the stop the last leg sets off from, on the journey as the
  // tree draws it: from being there until that vehicle leaves. Riding through is
  // no wait -- the same vehicle brought one to that stop, and one stays seated.
  //
  // The wait belongs to the drawn path, not to the scan's own bookkeeping. Where
  // the scan boarded the vehicle at an earlier stop, one may just as well board
  // it here, and here is where the picture shows one standing.
  waitBeforeLegInto(stationIndex) {
    const arriving = this._arrivedOn[stationIndex];
    if (arriving === NO_CONNECTION) {
      return null;
    }
    if (this.#rodeThroughTheStopBefore(arriving)) {
      return 0;
    }
    const fromStation = this._list.departureStations[arriving];
    return this._list.departureTimes[arriving] - this._arrivals[fromStation];
  }

  #rodeThroughTheStopBefore(connection) {
    const before = this._arrivedOn[this._list.departureStations[connection]];
    return (
      before !== NO_CONNECTION &&
      this._list.trips[before] === this._list.trips[connection]
    );
  }

  reachedStations() {
    return Array.from(this._arrivals).flatMap((arrival, stationIndex) =>
      arrival === UNREACHED ? [] : [stationIndex],
    );
  }

  // The journey to a station, earliest leg first: a chain of stops without a
  // hole, since every leg sets off where the one before it arrived. Changes of
  // vehicle -- whether at the arrival stop or at another stop of its
  // interchange -- sit between consecutive legs and carry no entry of their own.
  pathTo(stationIndex) {
    const reversed = [];
    let station = stationIndex;
    let leg = this.legInto(station);
    // The walk ends where nothing brought one: at the start, or at a stop of its
    // interchange, which one stood at from the beginning.
    while (leg !== null) {
      reversed.push(this._arrivedOn[station]);
      station = leg.fromStation;
      leg = this.legInto(station);
    }
    return reversed.reverse();
  }

  // The vehicles one really rides: a trip boarded once and stayed in until the
  // last stop it brings one to. Legs the tree drops in between -- a stop one
  // could already be at earlier -- do not break the ride apart, since one keeps
  // sitting in the vehicle through them.
  rides() {
    const rides = new Map();
    this.connections().forEach((connection) => {
      const trip = this._list.trips[connection];
      const arrivalTime = this._list.arrivalTimes[connection];
      const ride = rides.get(trip);
      if (ride === undefined) {
        rides.set(trip, {
          trip,
          departureTime: this._list.departureTimes[this._boardedOn[trip]],
          arrivalTime,
        });
      } else if (arrivalTime > ride.arrivalTime) {
        ride.arrivalTime = arrivalTime;
      }
    });
    return [...rides.values()];
  }

  // When the spread comes to rest: the last arrival anywhere. A tree that
  // reaches nowhere is over the moment it begins.
  latestArrival() {
    return this._arrivals.reduce(
      (latest, arrival) =>
        arrival === UNREACHED ? latest : Math.max(latest, arrival),
      this._startTime,
    );
  }

  // Every leg the tree is made of, each once -- what a panel draws. One leg can
  // stand for several stations at once when it serves an interchange.
  connections() {
    return [
      ...new Set(
        Array.from(this._arrivedOn).filter(
          (connection) => connection !== NO_CONNECTION,
        ),
      ),
    ];
  }
}

export class ConnectionScan {
  constructor(
    list,
    {
      minimumTransferSeconds = MINIMUM_TRANSFER_SECONDS,
      maximumWaitSeconds = MAXIMUM_WAIT_SECONDS,
    } = {},
  ) {
    this._list = list;
    this._minimumTransferSeconds = minimumTransferSeconds;
    this._maximumWaitSeconds = maximumWaitSeconds;
    this._arrivals = new Float64Array(list.stationCount);
    this._boardableFrom = new Float64Array(list.stationCount);
    this._boardableUntil = new Float64Array(list.stationCount);
    this._arrivedOn = new Int32Array(list.stationCount);
    this._boarded = new Uint8Array(list.tripCount);
    this._boardedOn = new Int32Array(list.tripCount);
  }

  from(startStation, startTimeSeconds) {
    this._arrivals.fill(UNREACHED);
    this._boardableFrom.fill(UNREACHED);
    this._boardableUntil.fill(NO_DEPARTURE_WINDOW);
    this._arrivedOn.fill(NO_CONNECTION);
    this._boarded.fill(0);
    this._boardedOn.fill(NO_CONNECTION);
    this._arrivals[startStation] = startTimeSeconds;
    this._boardableFrom[startStation] = startTimeSeconds;
    this._boardableUntil[startStation] =
      startTimeSeconds + this._maximumWaitSeconds;
    // One is not only at the stop one named but at its whole interchange: the
    // bus stop in front of the station is where one already stands, reached at
    // no cost, boardable once one has walked across.
    this._list.clusterSiblingsOf(startStation).forEach((sibling) => {
      this._arrivals[sibling] = startTimeSeconds;
      this.#allowBoardingAt(sibling, startTimeSeconds);
    });
    this.#scanFrom(this.#firstConnectionLeavingAt(startTimeSeconds));
    return new ReachabilityTree(
      this._list,
      startStation,
      startTimeSeconds,
      Float64Array.from(this._arrivals),
      Int32Array.from(this._arrivedOn),
      Int32Array.from(this._boardedOn),
      this._maximumWaitSeconds,
    );
  }

  // The list is in departure order, so everything before the start time is
  // unreachable by definition and is skipped without being looked at.
  #firstConnectionLeavingAt(startTimeSeconds) {
    const departureTimes = this._list.departureTimes;
    let low = 0;
    let high = this._list.connectionCount;
    while (low < high) {
      const middle = (low + high) >> 1;
      if (departureTimes[middle] < startTimeSeconds) {
        low = middle + 1;
      } else {
        high = middle;
      }
    }
    return low;
  }

  // The one place in this code base that walks by cursor rather than by
  // `forEach`, and the only one hot enough to earn it: a Swiss day holds 2.3
  // million legs, where the callback per element costs more than everything the
  // scan does with them. Measured on a real day -- 31 ms with `forEach`, 16 ms
  // with the cursor, same tree.
  #scanFrom(firstConnection) {
    const list = this._list;
    let connection = firstConnection;
    while (connection < list.connectionCount) {
      const trip = list.trips[connection];
      const from = list.departureStations[connection];
      const departure = list.departureTimes[connection];
      const boardable =
        this._boarded[trip] === 1 ||
        (this._boardableFrom[from] <= departure &&
          departure <= this._boardableUntil[from]);
      if (boardable) {
        if (this._boarded[trip] === 0) {
          this._boarded[trip] = 1;
          this._boardedOn[trip] = connection;
        }
        this.#arrive(connection);
      }
      connection += 1;
    }
  }

  #arrive(connection) {
    const station = this._list.arrivalStations[connection];
    const arrival = this._list.arrivalTimes[connection];
    if (arrival >= this._arrivals[station]) {
      return;
    }
    this._arrivals[station] = arrival;
    this._arrivedOn[station] = connection;
    this.#allowBoardingAt(station, arrival);
    this._list.clusterSiblingsOf(station).forEach((sibling) => {
      if (arrival < this._arrivals[sibling]) {
        this._arrivals[sibling] = arrival;
        this._arrivedOn[sibling] = connection;
        this.#allowBoardingAt(sibling, arrival);
      }
    });
  }

  // Arriving at a place opens a window on its departures: from the moment one
  // can have changed vehicles until patience runs out.
  #allowBoardingAt(station, arrival) {
    const boardable = arrival + this._minimumTransferSeconds;
    if (boardable < this._boardableFrom[station]) {
      this._boardableFrom[station] = boardable;
      this._boardableUntil[station] = arrival + this._maximumWaitSeconds;
    }
  }
}
