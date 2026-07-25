// Turns a station's raw arrival/departure pairs into a time-sorted list of sound
// events. A real stop yields an arrival (carrying its dwell length) and a
// departure; a pass-through, where a vehicle does not stop, yields a single
// event. Pure so it can be tested apart from the blob it is fed from.

export function deriveStationEvents(rawEvents) {
  const events = [];
  rawEvents.forEach(({ arrival, departure, category }) => {
    if (arrival === departure) {
      events.push({ time: departure, kind: 'passthrough', category });
    } else {
      events.push({
        time: arrival,
        kind: 'arrival',
        category,
        dwellSeconds: departure - arrival,
      });
      events.push({ time: departure, kind: 'departure', category });
    }
  });
  return events.sort((first, second) => first.time - second.time);
}
