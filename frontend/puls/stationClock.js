/**
 * The Swiss station clock without its red second hand. Both hands sweep instead
 * of jumping by the minute: the schedule runs many times faster than the wall
 * clock, and jumps would stutter.
 */
import { formatTimeOfDay } from '../viz-core/time/timeOfDay.js';
import { svgElement } from './svg.js';

const MINUTE_STEPS = 60;
const DEGREES_PER_MINUTE_STEP = 360 / MINUTE_STEPS;
const SECONDS_PER_MINUTE_HAND_DEGREE = 3600 / 360;
const SECONDS_PER_HOUR_HAND_DEGREE = (12 * 3600) / 360;

const FACE_RADIUS = 98;
const TICK_OUTER_EDGE = -94;
const HOUR_TICK = { width: 7, length: 24 };
const MINUTE_TICK = { width: 2.5, length: 7 };
const HOUR_HAND = { width: 12, reach: 64, tail: 20 };
const MINUTE_HAND = { width: 9, reach: 90, tail: 20 };

export const clockHandAngles = (timeOfDaySeconds) => ({
  minuteDegrees: (timeOfDaySeconds % 3600) / SECONDS_PER_MINUTE_HAND_DEGREE,
  hourDegrees: (timeOfDaySeconds % (12 * 3600)) / SECONDS_PER_HOUR_HAND_DEGREE,
});

const tick = (minuteStep) => {
  const { width, length } = minuteStep % 5 === 0 ? HOUR_TICK : MINUTE_TICK;
  return svgElement('rect', {
    class: 'station-clock-ink',
    x: -width / 2,
    y: TICK_OUTER_EDGE,
    width,
    height: length,
    transform: `rotate(${minuteStep * DEGREES_PER_MINUTE_STEP})`,
  });
};

const hand = ({ width, reach, tail }) =>
  svgElement('rect', {
    class: 'station-clock-ink',
    x: -width / 2,
    y: -reach,
    width,
    height: reach + tail,
  });

export class StationClock {
  constructor(container) {
    this.root = svgElement('svg', {
      class: 'station-clock',
      viewBox: '-100 -100 200 200',
      role: 'img',
    });
    this.hourHand = hand(HOUR_HAND);
    this.minuteHand = hand(MINUTE_HAND);
    this.root.append(
      svgElement('circle', { class: 'station-clock-face', r: FACE_RADIUS }),
      ...Array.from({ length: MINUTE_STEPS }, (_, minuteStep) =>
        tick(minuteStep),
      ),
      this.hourHand,
      this.minuteHand,
    );
    this.label = null;
    container.appendChild(this.root);
  }

  show(timeOfDaySeconds) {
    const { minuteDegrees, hourDegrees } = clockHandAngles(timeOfDaySeconds);
    this.minuteHand.setAttribute('transform', `rotate(${minuteDegrees})`);
    this.hourHand.setAttribute('transform', `rotate(${hourDegrees})`);
    this.#label(formatTimeOfDay(timeOfDaySeconds));
  }

  #label(timeOfDay) {
    if (timeOfDay !== this.label) {
      this.label = timeOfDay;
      this.root.setAttribute('aria-label', timeOfDay);
    }
  }
}
