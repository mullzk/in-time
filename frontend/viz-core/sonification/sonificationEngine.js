// How a timetable turns into sound, and which level decides what:
//
// 1. Which events exist at all -- this module with stationEvents.js, once per
//    chosen station. The trips are scanned for the calls at that station (or at
//    the cluster it belongs to) and yield a time-sorted list of arrivals,
//    departures and pass-throughs in schedule seconds.
// 2. Whether an event is voiced, and at which audio time -- scheduling.js,
//    applied by sonifier.js on every rendered frame. A cursor walks the list up
//    to a short lookahead horizon; the mute filter, the per-group gap and the
//    voice budget thin out what is left, and the schedule time is divided by the
//    tempo to become an absolute time on the audio clock.
// 3. What it sounds like -- a document, not code. presets.js imports the
//    instrumentations the sound card offers from instrumentations/; each names a
//    sound per transport group and per event, and instrumentation.js resolves a
//    group and an event kind against it into concrete superdough parameters. The
//    document may say as little as one sound for everything: what it leaves out
//    comes from the transport group above it, then from the document, then from
//    the sound itself (sounds/), then from the kind of sound (sounds/kinds.js),
//    which is where arrival is marked against departure by pitch and panorama or
//    -- for drums -- by speed and loudness. A standing vehicle gets a figure of
//    its own: silence, one strike, or the same sound at a fixed interval, which
//    the sonifier repeats for as long as the dwell lasts.
// 4. How it is produced -- audioBridge.js, the only side-effecting layer, over
//    the vendored superdough engine.
//
// This module answers what a single station -- the "ear" -- hears: the arrival,
// dwell, departure and pass-through events of every trip calling there. The
// trips a VehiclePositionEngine has parsed are scanned on demand rather than
// indexed by station, because only a station the user picks is ever asked for.

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
