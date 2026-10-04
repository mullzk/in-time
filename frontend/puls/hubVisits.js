/**
 * How the shown trips meet a hub: when they stand there, how many of each class
 * do so at a given moment, and which stretch of a run belongs to the hub.
 */
import { ARRIVING, DEPARTING } from './taktPhase.js';
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

// The run up to a hub and the run away from it, told apart because the phase a
// train shows has to agree with where it is going: a train still on its way to
// a hub is in no departure phase, whatever the clock says.
const hubSpans = (events, eventIndex) => {
  const { dep } = events[eventIndex];
  const startsHere = eventIndex === 0;
  const endsHere = eventIndex === events.length - 1;
  return [
    ...(startsHere
      ? []
      : [{ phase: ARRIVING, from: events[eventIndex - 1].dep, to: dep }]),
    ...(endsHere
      ? []
      : [{ phase: DEPARTING, from: dep, to: events[eventIndex + 1].arr }]),
  ];
};

// A passage lives in the legEdges of the call before it, so a run that is not
// scheduled to stop at a hub matches none of its stations.
export function hubSpansByTrip(trips, stationIndices) {
  return trips.map(({ events }) =>
    events.flatMap((event, eventIndex) =>
      stationIndices.has(event.station) ? hubSpans(events, eventIndex) : [],
    ),
  );
}

export const withinAHubSpan = (spans, phase, time) =>
  spans.some(
    (span) => span.phase === phase && span.from <= time && time <= span.to,
  );

export function standingCounts(visits, time) {
  const counts = Object.fromEntries(TRAIN_CLASSES.map(({ id }) => [id, 0]));
  visits
    .filter(({ arrival, departure }) => arrival <= time && time < departure)
    .forEach(({ trainClass }) => {
      counts[trainClass] += 1;
    });
  return counts;
}
