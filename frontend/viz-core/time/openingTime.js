// Which moment of the service day a view opens on, and the steps a departure
// moves in. The timetable is Swiss, so the wall clock consulted is Zurich's,
// whatever zone the browser stands in.

// A departure can be moved to any moment of the day, in five-minute steps --
// finer would be a false promise, since a picture changes by the timetable.
export const DEPARTURE_STEP_SECONDS = 300;

const ZURICH = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Zurich',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_HOUR = 3600;

// Outside these hours the country has mostly stopped, and a picture of it says
// more about the night than about the timetable, so the morning is shown
// instead.
const FIRST_HOUR_OF_ONES_OWN_DAY = 6 * SECONDS_PER_HOUR;
const LAST_HOUR_OF_ONES_OWN_DAY = 20 * SECONDS_PER_HOUR;
const MORNING_INSTEAD_OF_THE_NIGHT = 7 * SECONDS_PER_HOUR;

export function secondsOfDayInZurich(moment = new Date()) {
  const [hour, minute] = ZURICH.format(moment).split(':').map(Number);
  return hour * SECONDS_PER_HOUR + minute * SECONDS_PER_MINUTE;
}

const hourWorthOpeningOn = (secondsOfDay) =>
  secondsOfDay >= FIRST_HOUR_OF_ONES_OWN_DAY &&
  secondsOfDay < LAST_HOUR_OF_ONES_OWN_DAY
    ? secondsOfDay
    : MORNING_INSTEAD_OF_THE_NIGHT;

// The journey one could set off on right now, as long as the day still carries
// one. It is put on a step of its own slider, so that the picture and the
// slider under it are of one time.
export function departureToOpenOn(secondsOfDay) {
  const departure = hourWorthOpeningOn(secondsOfDay);
  return departure - (departure % DEPARTURE_STEP_SECONDS);
}

// A running picture opens a little way back, so that what one sees first is
// under way rather than about to leave. The hours it opens on all lie in the
// morning or later, well clear of the pre-dawn cut of the service day, so no
// lead can carry the opening across that seam.
export function playbackToOpenOn(secondsOfDay, { leadSeconds }) {
  return hourWorthOpeningOn(secondsOfDay) - leadSeconds;
}
