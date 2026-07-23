// Reads the binary schedule blob v1 (ITSB) and answers activeAt(t): the trips
// running at time t with their interpolated LV95 positions. Mirrors the column
// layout of the Python writer (backend/pipeline/schedule_blob.py); the shared
// golden fixture is the cross-language proof that both agree on the format.

const MAGIC = 'ITSB';
const VERSION = 1;

const HEADER = {
  version: 4,
  flags: 6,
  serviceDate: 8,
  originEast: 12,
  originNorth: 16,
  coordScale: 20,
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

const readU8Column = (view, start, count) => {
  const column = new Uint8Array(count);
  for (let index = 0; index < count; index += 1) {
    column[index] = view.getUint8(start + index);
  }
  return column;
};

const readU16Column = (view, start, count) => {
  const column = new Uint16Array(count);
  for (let index = 0; index < count; index += 1) {
    column[index] = view.getUint16(start + index * 2, true);
  }
  return column;
};

const readU32Column = (view, start, count) => {
  const column = new Uint32Array(count);
  for (let index = 0; index < count; index += 1) {
    column[index] = view.getUint32(start + index * 4, true);
  }
  return column;
};

const readI32Column = (view, start, count) => {
  const column = new Int32Array(count);
  for (let index = 0; index < count; index += 1) {
    column[index] = view.getInt32(start + index * 4, true);
  }
  return column;
};

const lerp = (from, to, fraction) => [
  from[0] + (to[0] - from[0]) * fraction,
  from[1] + (to[1] - from[1]) * fraction,
];

export class VehiclePositionEngine {
  constructor(arrayBuffer) {
    const view = new DataView(arrayBuffer);
    this.#readMagic(view);

    this.stationCount = view.getUint32(HEADER.stationCount, true);
    this.edgeCount = view.getUint32(HEADER.edgeCount, true);
    this.pointCount = view.getUint32(HEADER.pointCount, true);
    this.tripCount = view.getUint32(HEADER.tripCount, true);
    this.eventCount = view.getUint32(HEADER.eventCount, true);
    this.pathCount = view.getUint32(HEADER.pathCount, true);

    const originEast = view.getUint32(HEADER.originEast, true);
    const originNorth = view.getUint32(HEADER.originNorth, true);

    this.stations = this.#readStations(view, originEast, originNorth);
    this.edges = this.#readEdges(view, originEast, originNorth);
    this.#buildEdgeArcLengths();
    this.trips = this.#readTrips(view);
    this.#deriveOperatingWindow();
  }

  #readMagic(view) {
    const magic = String.fromCharCode(
      view.getUint8(0),
      view.getUint8(1),
      view.getUint8(2),
      view.getUint8(3),
    );
    if (magic !== MAGIC) {
      throw new Error(`not an ITSB blob: ${magic}`);
    }
    if (view.getUint16(HEADER.version, true) !== VERSION) {
      throw new Error('unsupported ITSB version');
    }
  }

  #readStations(view, originEast, originNorth) {
    const start = view.getUint32(HEADER.offsetStations, true);
    const east = readU32Column(view, start, this.stationCount);
    const north = readU32Column(
      view,
      start + this.stationCount * 4,
      this.stationCount,
    );
    return Array.from({ length: this.stationCount }, (_, index) => [
      east[index] + originEast,
      north[index] + originNorth,
    ]);
  }

  #readEdges(view, originEast, originNorth) {
    const edgeStart = view.getUint32(HEADER.offsetEdges, true);
    const pointStart = readU32Column(view, edgeStart, this.edgeCount);
    const pointLen = readU16Column(
      view,
      edgeStart + this.edgeCount * 4,
      this.edgeCount,
    );

    const pointsStart = view.getUint32(HEADER.offsetPoints, true);
    const east = readU32Column(view, pointsStart, this.pointCount);
    const north = readU32Column(
      view,
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
    this.edgeCumulative = this.edges.map((polyline) => {
      const cumulative = [0];
      for (let point = 1; point < polyline.length; point += 1) {
        cumulative.push(
          cumulative[point - 1] +
            Math.hypot(
              polyline[point][0] - polyline[point - 1][0],
              polyline[point][1] - polyline[point - 1][1],
            ),
        );
      }
      return cumulative;
    });
    this.edgeLengths = this.edgeCumulative.map(
      (cumulative) => cumulative[cumulative.length - 1],
    );
  }

  #readTrips(view) {
    const tripStart = view.getUint32(HEADER.offsetTrips, true);
    const count = this.tripCount;
    const category = readU8Column(view, tripStart, count);
    const eventStart = readU32Column(view, tripStart + count * 9, count);
    const eventLen = readU16Column(view, tripStart + count * 13, count);

    const eventsStart = view.getUint32(HEADER.offsetEvents, true);
    const evStation = readU32Column(view, eventsStart, this.eventCount);
    const evArr = readU32Column(
      view,
      eventsStart + this.eventCount * 4,
      this.eventCount,
    );
    const evDep = readU32Column(
      view,
      eventsStart + this.eventCount * 8,
      this.eventCount,
    );
    const evLegEdgeCount = readU16Column(
      view,
      eventsStart + this.eventCount * 12,
      this.eventCount,
    );

    const path = readI32Column(
      view,
      view.getUint32(HEADER.offsetPath, true),
      this.pathCount,
    );

    let pathCursor = 0;
    return Array.from({ length: count }, (_, trip) => {
      const first = eventStart[trip];
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
      return {
        category: category[trip],
        events,
        legCumulative: this.#legCumulative(events),
      };
    });
  }

  #legCumulative(events) {
    const cumulative = [0];
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
      cumulative.push(cumulative[index] + legDistance);
    });
    return cumulative;
  }

  // A leg with no edges is a straight line between its two stations (the hybrid
  // rule buses always follow, and rail's rare straight fallback).
  #straightLegLength(fromEvent, toEvent) {
    const from = this.stations[fromEvent.station];
    const to = this.stations[toEvent.station];
    return Math.hypot(to[0] - from[0], to[1] - from[1]);
  }

  #deriveOperatingWindow() {
    this.rangeStart = Math.min(...this.trips.map((trip) => trip.events[0].dep));
    this.rangeEnd = Math.max(
      ...this.trips.map((trip) => trip.events[trip.events.length - 1].arr),
    );
  }

  #pointOnEdge(signedEdge, distanceIntoEdge) {
    const edge = Math.abs(signedEdge) - 1;
    const polyline = this.edges[edge];
    const cumulative = this.edgeCumulative[edge];
    const target =
      signedEdge < 0
        ? this.edgeLengths[edge] - distanceIntoEdge
        : distanceIntoEdge;

    let segment = 1;
    while (segment < cumulative.length - 1 && cumulative[segment] < target) {
      segment += 1;
    }
    const segmentLength = cumulative[segment] - cumulative[segment - 1];
    const fraction =
      segmentLength === 0
        ? 0
        : (target - cumulative[segment - 1]) / segmentLength;
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
    const { legCumulative, events } = trip;
    let leg = 0;
    while (
      leg < legCumulative.length - 1 &&
      legCumulative[leg + 1] < distance
    ) {
      leg += 1;
    }
    const distanceIntoLeg = distance - legCumulative[leg];
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
    const { events, legCumulative } = trip;
    for (let index = 0; index < events.length; index += 1) {
      if (t < events[index].arr) {
        break;
      }
      if (t <= events[index].dep) {
        return legCumulative[index];
      }
      if (index + 1 < events.length && t < events[index + 1].arr) {
        const fraction =
          (t - events[index].dep) / (events[index + 1].arr - events[index].dep);
        return (
          legCumulative[index] +
          fraction * (legCumulative[index + 1] - legCumulative[index])
        );
      }
    }
    return legCumulative[legCumulative.length - 1];
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
