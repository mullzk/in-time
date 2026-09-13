/**
 * The base hubs of the Swiss clock-face timetable and the trains standing in them.
 */
import { EasedCounts } from './easedCounts.js';
import { hubLayerRadii } from './hubLayers.js';
import { hubVisits, standingCounts } from './hubVisits.js';

export const HUB_DIDOKS = [
  8500010, 8503000, 8507000, 8500218, 8505000, 8506302, 8509000,
];

export class Hub {
  constructor(name, east, north, visits) {
    this.name = name;
    this.east = east;
    this.north = north;
    this.visits = visits;
    this.easedCounts = new EasedCounts();
    this.counts = standingCounts([], 0);
  }

  easeTowardsTheTrainsStandingAt(time, deltaSeconds) {
    this.counts = this.easedCounts.easeTowards(
      standingCounts(this.visits, time),
      deltaSeconds,
    );
  }

  layerRadii() {
    return hubLayerRadii(this.counts);
  }
}

const clusterStationIndices = (stations, didok) =>
  new Set(
    stations.flatMap((station, index) =>
      station.didok === didok || station.cluster === didok ? [index] : [],
    ),
  );

export function hubsOf(stations, stationPositions, trips) {
  return HUB_DIDOKS.flatMap((didok) => {
    const stationIndex = stations.findIndex(
      (station) => station.didok === didok,
    );
    if (stationIndex === -1) {
      return [];
    }
    const [east, north] = stationPositions[stationIndex];
    const visits = hubVisits(trips, clusterStationIndices(stations, didok));
    return [new Hub(stations[stationIndex].name, east, north, visits)];
  });
}
