import { SECONDS_PER_DAY } from './timeModel.js';

// Which moment of the service day a view opens on, and the steps a departure
// moves in. The timetable is Swiss, so the wall clock consulted is Zurich's,
// whatever zone the browser stands in.

// A departure can be moved to any moment of the day, in five-minute steps --
// finer would be a false promise, since a picture changes by the timetable.
export const DEPARTURE_STEP_SECONDS = 300;

// The day a panel falls back on while nothing has named the one it shows.
export const todayIso = () => new Date().toISOString().slice(0, 10);

const ZURICH = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Zurich',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_HOUR = 3600;

// Past this hour a journey set off now would run into a country that has mostly
// stopped, which says more about the night than about the timetable.
const LAST_DEPARTURE_OF_ONES_OWN_DAY = 20 * SECONDS_PER_HOUR;
const DEPARTURE_INSTEAD_OF_THE_NIGHT = 7 * SECONDS_PER_HOUR;

export function secondsOfDayInZurich(moment = new Date()) {
  const [hour, minute] = ZURICH.format(moment).split(':').map(Number);
  return hour * SECONDS_PER_HOUR + minute * SECONDS_PER_MINUTE;
}

// The journey one could set off on right now, as long as the day still carries
// one; late in the evening the morning is shown instead. It is put on a step of
// its own slider, so that the picture and the slider under it are of one time.
export function departureToOpenOn(secondsOfDay) {
  const departure =
    secondsOfDay < LAST_DEPARTURE_OF_ONES_OWN_DAY
      ? secondsOfDay
      : DEPARTURE_INSTEAD_OF_THE_NIGHT;
  return departure - (departure % DEPARTURE_STEP_SECONDS);
}

// A running picture opens a little way back, so that what one sees first is
// under way rather than about to leave. A service day is not a calendar day: it
// is cut in the pre-dawn lull and runs past midnight, so a moment before the cut
// belongs to the end of the day, not to its beginning.
export function playbackToOpenOn(secondsOfDay, { leadSeconds, dayCutSeconds }) {
  const opening =
    (secondsOfDay - leadSeconds + SECONDS_PER_DAY) % SECONDS_PER_DAY;
  return opening < dayCutSeconds ? opening + SECONDS_PER_DAY : opening;
}
