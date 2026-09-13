/**
 * When trains stand at a hub: the calls of the shown trips there, and how many of
 * each class stand at a given moment.
 */
import { TRAIN_CLASSES, trainClassOf } from './trainClasses.js';

// A trip's first and last call carry no dwell, and the blob does not tell which
// arriving trip turns into which departing one. Without a dwell of its own, a
// terminus like Luzern would never hold a train.
export const TERMINUS_DWELL_SECONDS = 10 * 60;

export function standingSpan(events, eventIndex) {
  const { arr, dep } = events[eventIndex];
  if (eventIndex === 0) {
    return { arrival: dep - TERMINUS_DWELL_SECONDS, departure: dep };
  }
  if (eventIndex === events.length - 1) {
    return { arrival: arr, departure: arr + TERMINUS_DWELL_SECONDS };
  }
  return { arrival: arr, departure: dep };
}

export function hubVisits(trips, stationIndices) {
  return trips.flatMap(({ category, events }) => {
    const trainClass = trainClassOf(category);
    if (trainClass === null) {
      return [];
    }
    return events.flatMap((event, eventIndex) =>
      stationIndices.has(event.station)
        ? [{ ...standingSpan(events, eventIndex), trainClass }]
        : [],
    );
  });
}

export function standingCounts(visits, time) {
  const counts = Object.fromEntries(TRAIN_CLASSES.map(({ id }) => [id, 0]));
  visits
    .filter(({ arrival, departure }) => arrival <= time && time < departure)
    .forEach(({ trainClass }) => {
      counts[trainClass] += 1;
    });
  return counts;
}
