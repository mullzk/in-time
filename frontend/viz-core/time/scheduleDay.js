/**
 * The clock a view of the whole day runs on: a 24-hour window that loops, set
 * to the time the visitor arrives at.
 */
import { playbackToOpenOn, secondsOfDayInZurich } from './openingTime.js';
import { SECONDS_PER_DAY, TimeModel } from './timeModel.js';

// A service day's trips span more than 24 h (trains running past midnight). We
// loop a fixed 24-hour window whose seam sits in the pre-dawn lull (~03:00,
// almost no service), so wall-clock time stays continuous across the wrap.
const DAY_CUT_SECONDS = 3 * 3600;
const PLAYBACK_LEAD_SECONDS = 10 * 60;

export function clockOnTheLoopingDay() {
  const time = new TimeModel(
    DAY_CUT_SECONDS,
    DAY_CUT_SECONDS + SECONDS_PER_DAY,
  );
  time.seekToTime(
    playbackToOpenOn(secondsOfDayInZurich(), {
      leadSeconds: PLAYBACK_LEAD_SECONDS,
    }),
  );
  return time;
}
