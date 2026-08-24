import { byRisingRank } from '../viz-core/data/transportCategories.js';

// The places a spread reaches, kept the way a frame needs them: grouped by the
// traffic that gets there -- which decides colour, size and what is drawn over
// what -- and inside a group ordered by the moment one arrives. Both questions a
// frame asks then answer as a prefix of a group: what is lit at all, and what
// has just lit up. Twenty thousand places are drawn sixty times a second, so
// neither question may walk them.

const countAtOrBelow = (values, limit) => {
  let low = 0;
  let high = values.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (values[middle] <= limit) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }
  return low;
};

export class ReachedPlaces {
  constructor(places) {
    this._groups = groupsByCategory(places)
      .map(([category, group]) => groupOf(category, group))
      .sort(byRisingRank);
  }

  // Where each group stands at this moment: everything up to `reachedUntil` is
  // lit, and everything from `settledUntil` on is still flashing.
  runsAt(seconds, flashSeconds) {
    return this._groups.map((group) => ({
      category: group.category,
      easts: group.easts,
      norths: group.norths,
      arrivals: group.arrivals,
      settledUntil: countAtOrBelow(group.arrivals, seconds - flashSeconds),
      reachedUntil: countAtOrBelow(group.arrivals, seconds),
    }));
  }

  // The places themselves, in the order they are drawn -- what a pointer picks
  // from.
  reachedAt(seconds) {
    return this._groups.flatMap((group) =>
      group.places.slice(0, countAtOrBelow(group.arrivals, seconds)),
    );
  }
}

function groupsByCategory(places) {
  const byCategory = new Map();
  places.forEach((place) => {
    byCategory.set(place.category, [
      ...(byCategory.get(place.category) ?? []),
      place,
    ]);
  });
  return [...byCategory.entries()];
}

function groupOf(category, places) {
  const ordered = [...places].sort(
    (first, second) => first.arrivalTime - second.arrivalTime,
  );
  return {
    category,
    places: ordered,
    easts: Float64Array.from(ordered, (place) => place.east),
    norths: Float64Array.from(ordered, (place) => place.north),
    arrivals: Float64Array.from(ordered, (place) => place.arrivalTime),
  };
}
