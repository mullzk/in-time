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
    const references = this.stationReferences.get(stationIndex) ?? [];
    const rawEvents = references.map(({ tripIndex, eventOffset }) => {
      const trip = this.trips[tripIndex];
      const event = trip.events[eventOffset];
      return {
        arrival: event.arr,
        departure: event.dep,
        category: trip.category,
      };
    });
    return deriveStationEvents(rawEvents);
  }
}
