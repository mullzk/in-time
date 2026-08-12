// Answers what a single station -- the "ear" -- hears: the arrival, dwell,
// departure and pass-through events of every trip calling there. The trips a
// VehiclePositionEngine has parsed are scanned on demand rather than indexed by
// station, because only a station the user picks is ever asked for.

import { deriveStationEvents } from './stationEvents.js';

export class SonificationEngine {
  constructor(trips) {
    this.trips = trips;
  }

  eventsAtStation(stationIndex) {
    return this.eventsAtCluster([stationIndex]);
  }

  // A cluster is a set of station indices treated as one place, so a bus
  // threading two cluster stops sounds once, not twice.
  eventsAtCluster(stationIndices) {
    const clusterStations = new Set(stationIndices);
    const rawEvents = [];
    this.trips.forEach((trip) => {
      const stopIndices = [];
      trip.events.forEach((event, stopIndex) => {
        if (clusterStations.has(event.station)) {
          stopIndices.push(stopIndex);
        }
      });
      visitsWithin(stopIndices).forEach(({ startStopIndex, endStopIndex }) => {
        rawEvents.push({
          arrival: trip.events[startStopIndex].arr,
          departure: trip.events[endStopIndex].dep,
          category: trip.category,
        });
      });
    });
    return deriveStationEvents(rawEvents);
  }
}

// A trip's consecutive calls within the cluster are one visit -- the first
// call's arrival to the last call's departure. A later re-entry is a separate
// visit.
function visitsWithin(stopIndices) {
  const visits = [];
  stopIndices.forEach((stopIndex) => {
    const current = visits[visits.length - 1];
    if (current !== undefined && stopIndex === current.endStopIndex + 1) {
      current.endStopIndex = stopIndex;
    } else {
      visits.push({ startStopIndex: stopIndex, endStopIndex: stopIndex });
    }
  });
  return visits;
}
