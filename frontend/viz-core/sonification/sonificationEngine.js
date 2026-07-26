// Indexes a day's trips by the station they call at, so the sonifier can ask a
// single station -- the "ear" -- for the arrival, dwell, departure and
// pass-through events it hears. Built once per blob from the trips a
// VehiclePositionEngine has already parsed; the events themselves are derived on
// demand and shared across trips serving the same station.

import { deriveStationEvents } from './stationEvents.js';

export class SonificationEngine {
  constructor(trips) {
    this.trips = trips;
    this.stationReferences = new Map();
    trips.forEach((trip, tripIndex) => {
      trip.events.forEach((event, eventOffset) => {
        const references = this.stationReferences.get(event.station) ?? [];
        references.push({ tripIndex, eventOffset });
        this.stationReferences.set(event.station, references);
      });
    });
  }

  eventsAtStation(stationIndex) {
    return this.eventsAtCluster([stationIndex]);
  }

  // A cluster is a set of station indices treated as one place. A trip's
  // consecutive calls within the cluster collapse into a single visit -- the
  // first call's arrival to the last call's departure -- so a bus threading two
  // cluster stops sounds once, not twice. A later re-entry is a separate visit.
  eventsAtCluster(stationIndices) {
    const offsetsByTrip = new Map();
    stationIndices.forEach((stationIndex) => {
      (this.stationReferences.get(stationIndex) ?? []).forEach(
        ({ tripIndex, eventOffset }) => {
          const offsets = offsetsByTrip.get(tripIndex);
          if (offsets) {
            offsets.push(eventOffset);
          } else {
            offsetsByTrip.set(tripIndex, [eventOffset]);
          }
        },
      );
    });

    const rawEvents = [];
    offsetsByTrip.forEach((offsets, tripIndex) => {
      const trip = this.trips[tripIndex];
      offsets.sort((first, second) => first - second);
      let runStart = offsets[0];
      let previous = offsets[0];
      offsets.slice(1).forEach((offset) => {
        if (offset !== previous + 1) {
          rawEvents.push(this.#visit(trip, runStart, previous));
          runStart = offset;
        }
        previous = offset;
      });
      rawEvents.push(this.#visit(trip, runStart, previous));
    });
    return deriveStationEvents(rawEvents);
  }

  #visit(trip, startOffset, endOffset) {
    return {
      arrival: trip.events[startOffset].arr,
      departure: trip.events[endOffset].dep,
      category: trip.category,
    };
  }
}
