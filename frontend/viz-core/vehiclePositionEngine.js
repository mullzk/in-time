// Reads the binary schedule blob v2 (ITSB) and answers activeAt(t): the trips
// running at time t with their interpolated LV95 positions. Mirrors the column
// layout of the Python writer (backend/pipeline/schedule_blob.py); the shared
// golden fixture is the cross-language proof that both agree on the format.

import { readStationPoints } from './blobStations.js';

const MAGIC = 'ITSB';
const VERSION = 2;

// Byte offsets into the fixed 88-byte header. Byte 20 is a reserved word the
// writer zeroes, hence the gap.
const HEADER = {
  version: 4,
  networkType: 6,
  serviceDate: 8,
  originEast: 12,
  originNorth: 16,
  stationCount: 24,
  edgeCount: 28,
  pointCount: 32,
  tripCount: 36,
  eventCount: 40,
  pathCount: 44,
  offsetStations: 48,
  offsetEdges: 52,
  offsetPoints: 56,
  offsetTrips: 60,
  offsetEvents: 64,
  offsetPath: 68,
};

const readU8Column = (dataView, start, count) => {
  const column = new Uint8Array(count);
  for (let index = 0; index < count; index += 1) {
    column[index] = dataView.getUint8(start + index);
  }
  return column;
};

const readU16Column = (dataView, start, count) => {
  const column = new Uint16Array(count);
  for (let index = 0; index < count; index += 1) {
    column[index] = dataView.getUint16(start + index * 2, true);
  }
  return column;
};

const readU32Column = (dataView, start, count) => {
  const column = new Uint32Array(count);
  for (let index = 0; index < count; index += 1) {
    column[index] = dataView.getUint32(start + index * 4, true);
  }
  return column;
};

const readI32Column = (dataView, start, count) => {
  const column = new Int32Array(count);
  for (let index = 0; index < count; index += 1) {
    column[index] = dataView.getInt32(start + index * 4, true);
  }
  return column;
};

const lerp = (from, to, fraction) => [
  from[0] + (to[0] - from[0]) * fraction,
  from[1] + (to[1] - from[1]) * fraction,
];

export class VehiclePositionEngine {
  constructor(arrayBuffer) {
    const dataView = new DataView(arrayBuffer);
    this.#readMagic(dataView);

    this.stationCount = dataView.getUint32(HEADER.stationCount, true);
    this.edgeCount = dataView.getUint32(HEADER.edgeCount, true);
    this.pointCount = dataView.getUint32(HEADER.pointCount, true);
    this.tripCount = dataView.getUint32(HEADER.tripCount, true);
    this.eventCount = dataView.getUint32(HEADER.eventCount, true);
    this.pathCount = dataView.getUint32(HEADER.pathCount, true);

    const originEast = dataView.getUint32(HEADER.originEast, true);
    const originNorth = dataView.getUint32(HEADER.originNorth, true);

    this.stations = readStationPoints(arrayBuffer);
    this.edges = this.#readEdges(dataView, originEast, originNorth);
    this.#buildEdgeArcLengths();
    this.trips = this.#readTrips(dataView);
    this.#deriveOperatingWindow();
  }

  #readMagic(dataView) {
    const magic = String.fromCharCode(
      dataView.getUint8(0),
      dataView.getUint8(1),
      dataView.getUint8(2),
      dataView.getUint8(3),
    );
    if (magic !== MAGIC) {
      throw new Error(`not an ITSB blob: ${magic}`);
    }
    if (dataView.getUint16(HEADER.version, true) !== VERSION) {
      throw new Error('unsupported ITSB version');
    }
  }

  #readEdges(dataView, originEast, originNorth) {
    const edgeStart = dataView.getUint32(HEADER.offsetEdges, true);
    const pointStart = readU32Column(dataView, edgeStart, this.edgeCount);
    const pointLen = readU16Column(
      dataView,
      edgeStart + this.edgeCount * 4,
      this.edgeCount,
    );

    const pointsStart = dataView.getUint32(HEADER.offsetPoints, true);
    const east = readU32Column(dataView, pointsStart, this.pointCount);
    const north = readU32Column(
      dataView,
      pointsStart + this.pointCount * 4,
      this.pointCount,
    );

    return Array.from({ length: this.edgeCount }, (_, edge) => {
      const first = pointStart[edge];
      return Array.from({ length: pointLen[edge] }, (_, point) => [
        east[first + point] + originEast,
        north[first + point] + originNorth,
      ]);
    });
  }

  #buildEdgeArcLengths() {
    this.edgeDistancesToPoints = this.edges.map((polyline) => {
      const distancesToPoints = [0];
      for (let point = 1; point < polyline.length; point += 1) {
        distancesToPoints.push(
          distancesToPoints[point - 1] +
            Math.hypot(
              polyline[point][0] - polyline[point - 1][0],
              polyline[point][1] - polyline[point - 1][1],
            ),
        );
      }
      return distancesToPoints;
    });
    this.edgeLengths = this.edgeDistancesToPoints.map(
      (distancesToPoints) => distancesToPoints[distancesToPoints.length - 1],
    );
  }

  #readTrips(dataView) {
    const tripStart = dataView.getUint32(HEADER.offsetTrips, true);
    const count = this.tripCount;
    const category = readU8Column(dataView, tripStart, count);
    const eventStart = readU32Column(dataView, tripStart + count, count);
    const eventLen = readU16Column(dataView, tripStart + count * 5, count);

    const eventsStart = dataView.getUint32(HEADER.offsetEvents, true);
    const evStation = readU32Column(dataView, eventsStart, this.eventCount);
    const evArr = readU32Column(
      dataView,
      eventsStart + this.eventCount * 4,
      this.eventCount,
    );
    const evDep = readU32Column(
      dataView,
      eventsStart + this.eventCount * 8,
      this.eventCount,
    );
    const evLegEdgeCount = readU16Column(
      dataView,
      eventsStart + this.eventCount * 12,
      this.eventCount,
    );

    const path = readI32Column(
      dataView,
      dataView.getUint32(HEADER.offsetPath, true),
      this.pathCount,
    );

    let pathCursor = 0;
    // Returns List of Trips
    return Array.from({ length: count }, (_, trip) => {
      const first = eventStart[trip];
      // Events: Station-Index, Arrival, Departure + Edges of outgoing Leg
      const events = Array.from({ length: eventLen[trip] }, (_, offset) => {
        const eventIndex = first + offset;
        const legEdges = Array.from(
          { length: evLegEdgeCount[eventIndex] },
          () => path[pathCursor++],
        );
        return {
          station: evStation[eventIndex],
          arr: evArr[eventIndex],
          dep: evDep[eventIndex],
          legEdges,
        };
      });
      // Trip: Category, Events, and Distances to every stop
      return {
        category: category[trip],
        events,
        tripDistancesToEvents: this.#tripDistancesToEvents(events),
      };
    });
  }

  #tripDistancesToEvents(events) {
    const distancesToEvents = [0];
    events.forEach((event, index) => {
      if (index === events.length - 1) {
        return;
      }
      const legDistance =
        event.legEdges.length === 0
          ? this.#straightLegLength(event, events[index + 1])
          : event.legEdges.reduce(
              (sum, signedEdge) =>
                sum + this.edgeLengths[Math.abs(signedEdge) - 1],
              0,
            );
      distancesToEvents.push(distancesToEvents[index] + legDistance);
    });
    return distancesToEvents;
  }

  // A leg with no edges is a straight line between its two stations — the shape
  // every bus leg takes. Rail and tram always carry routed edges, their straight
  // fallback included.
  #straightLegLength(fromEvent, toEvent) {
    const from = this.stations[fromEvent.station];
    const to = this.stations[toEvent.station];
    return Math.hypot(to[0] - from[0], to[1] - from[1]);
  }

  #deriveOperatingWindow() {
    this.rangeStart = this.trips.reduce(
      (earliest, trip) => Math.min(earliest, trip.events[0].dep),
      Infinity,
    );
    this.rangeEnd = this.trips.reduce(
      (latest, trip) =>
        Math.max(latest, trip.events[trip.events.length - 1].arr),
      -Infinity,
    );
  }

  #pointOnEdge(signedEdge, distanceIntoEdge) {
    const edge = Math.abs(signedEdge) - 1;
    const polyline = this.edges[edge];
    const distancesToPoints = this.edgeDistancesToPoints[edge];
    const target =
      signedEdge < 0
        ? this.edgeLengths[edge] - distanceIntoEdge
        : distanceIntoEdge;

    let segment = 1;
    while (
      segment < distancesToPoints.length - 1 &&
      distancesToPoints[segment] < target
    ) {
      segment += 1;
    }
    const segmentLength =
      distancesToPoints[segment] - distancesToPoints[segment - 1];
    const fraction =
      segmentLength === 0
        ? 0
        : (target - distancesToPoints[segment - 1]) / segmentLength;
    return lerp(polyline[segment - 1], polyline[segment], fraction);
  }

  #pointOnLeg(legEdges, distanceIntoLeg) {
    let remaining = distanceIntoLeg;
    for (let index = 0; index < legEdges.length; index += 1) {
      const length = this.edgeLengths[Math.abs(legEdges[index]) - 1];
      if (remaining <= length || index === legEdges.length - 1) {
        return this.#pointOnEdge(legEdges[index], remaining);
      }
      remaining -= length;
    }
    return this.stations[0];
  }

  #pointAtTripDistance(trip, distance) {
    const { tripDistancesToEvents, events } = trip;
    let leg = 0;
    while (
      leg < tripDistancesToEvents.length - 1 &&
      tripDistancesToEvents[leg + 1] < distance
    ) {
      leg += 1;
    }
    const distanceIntoLeg = distance - tripDistancesToEvents[leg];
    if (events[leg].legEdges.length === 0) {
      return this.#pointOnStraightLeg(
        events[leg],
        events[leg + 1],
        distanceIntoLeg,
      );
    }
    return this.#pointOnLeg(events[leg].legEdges, distanceIntoLeg);
  }

  #pointOnStraightLeg(fromEvent, toEvent, distanceIntoLeg) {
    const from = this.stations[fromEvent.station];
    const to = this.stations[toEvent.station];
    const length = this.#straightLegLength(fromEvent, toEvent);
    return lerp(from, to, length === 0 ? 0 : distanceIntoLeg / length);
  }

  #tripDistanceAt(trip, t) {
    const { events, tripDistancesToEvents } = trip;
    for (let index = 0; index < events.length; index += 1) {
      if (t < events[index].arr) {
        break;
      }
      if (t <= events[index].dep) {
        return tripDistancesToEvents[index];
      }
      if (index + 1 < events.length && t < events[index + 1].arr) {
        const fraction =
          (t - events[index].dep) / (events[index + 1].arr - events[index].dep);
        return (
          tripDistancesToEvents[index] +
          fraction *
            (tripDistancesToEvents[index + 1] - tripDistancesToEvents[index])
        );
      }
    }
    return tripDistancesToEvents[tripDistancesToEvents.length - 1];
  }

  tripEndpoints(tripIndex) {
    const { events } = this.trips[tripIndex];
    return {
      originStation: events[0].station,
      destinationStation: events[events.length - 1].station,
    };
  }

  // A selected vehicle's live position, recomputed each frame so a popover can
  // follow it; null once the trip is no longer running (so the caller drops it).
  positionAt(tripIndex, t) {
    const trip = this.trips[tripIndex];
    const firstDep = trip.events[0].dep;
    const lastArr = trip.events[trip.events.length - 1].arr;
    if (t < firstDep || t > lastArr) {
      return null;
    }
    const [east, north] = this.#pointAtTripDistance(
      trip,
      this.#tripDistanceAt(trip, t),
    );
    return { east, north };
  }

  // The same trip at receding schedule times — the smear a moving vehicle drags
  // behind it. Ordered head first and cut short where the trip had not yet
  // departed, so a just-started trip carries a short trail rather than a stub at
  // its origin.
  trailPositions(tripIndex, t, sampleCount, spacingSeconds) {
    const samples = Array.from({ length: sampleCount }, (_, sample) =>
      this.positionAt(tripIndex, t - sample * spacingSeconds),
    );
    const firstMissing = samples.indexOf(null);
    return firstMissing === -1 ? samples : samples.slice(0, firstMissing);
  }

  activeAt(t) {
    const active = [];
    this.trips.forEach((trip, tripIndex) => {
      const firstDep = trip.events[0].dep;
      const lastArr = trip.events[trip.events.length - 1].arr;
      if (t < firstDep || t > lastArr) {
        return;
      }
      const [east, north] = this.#pointAtTripDistance(
        trip,
        this.#tripDistanceAt(trip, t),
      );
      active.push({ tripIndex, category: trip.category, east, north });
    });
    return active;
  }
}
