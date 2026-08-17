// The places a spread reaches, kept the way a frame needs them: grouped by the
// traffic that gets there -- which decides colour, size and what is drawn over
// what -- and inside a group ordered by the moment one arrives. Both questions a
// frame asks then answer as a prefix of a group: what is lit at all, and what
// has just lit up. Twenty thousand places are drawn sixty times a second, so
// neither question may walk them.

// How many of the ordered values are at or below the limit.
const countUpTo = (values, limit) => {
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

const byRisingRank = (first, second) => second.category - first.category;

export class ReachedPlaces {
  constructor(places) {
    const byCategory = new Map();
    places.forEach((place) => {
      const group = byCategory.get(place.category) ?? [];
      group.push(place);
      byCategory.set(place.category, group);
    });
    this._groups = [...byCategory.entries()]
      .map(([category, group]) => groupOf(category, group))
      .sort(byRisingRank);
  }

  groups() {
    return this._groups;
  }

  countReachedAt(seconds) {
    return this._groups.reduce(
      (count, group) => count + countUpTo(group.arrivals, seconds),
      0,
    );
  }

  // Where each group stands at this moment: everything up to `reachedUntil` is
  // lit, and everything from `settledUntil` on is still flashing.
  runsAt(seconds, flashSeconds) {
    return this._groups.map((group) => ({
      category: group.category,
      easts: group.easts,
      norths: group.norths,
      arrivals: group.arrivals,
      settledUntil: countUpTo(group.arrivals, seconds - flashSeconds),
      reachedUntil: countUpTo(group.arrivals, seconds),
    }));
  }

  // The places themselves, in the order they are drawn -- what a pointer picks
  // from, and what the count is made of.
  reachedAt(seconds) {
    return this._groups.flatMap((group) =>
      group.places.slice(0, countUpTo(group.arrivals, seconds)),
    );
  }
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
