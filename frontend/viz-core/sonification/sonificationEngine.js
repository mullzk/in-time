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
// 3. What it sounds like -- three modules in one line of descent. presets.js
//    holds the palettes the sidebar offers; each is an Instrumentation, which is
//    no more than a map from the four transport groups to one sound type each
//    (instrumentation.js). A sound type (soundType.js) is the behaviour: given
//    an event kind it produces the concrete superdough parameters, marking
//    arrival against departure by pitch and panorama, or -- for drum kits -- by
//    sample bank. So the palette decides the timbre, the event's category
//    decides which of its four voices speaks, and the event's kind decides how
//    that voice is played. A standing vehicle instead gets a repeating figure,
//    which the sonifier loops for as long as the dwell lasts.
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
