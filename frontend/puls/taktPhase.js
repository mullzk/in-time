/**
 * The colour of the half-hourly Takt phase: cool while the trains fan out from
 * the nodes, warm while they gather back in, and the element's own neutral
 * colour at the quarter, where the two halves meet.
 */
const HALF_HOUR_SECONDS = 1800;
const DEPARTURE_BLUE = [20, 110, 185];
const ARRIVAL_AMBER = [190, 110, 0];

const mixed = (from, to, amount) =>
  from.map((channel, index) => channel + (to[index] - channel) * amount);

const halfHourFraction = (currentTimeSeconds) =>
  (currentTimeSeconds % HALF_HOUR_SECONDS) / HALF_HOUR_SECONDS;

export function taktPhaseColor(neutralColor, currentTimeSeconds) {
  const fraction = halfHourFraction(currentTimeSeconds);
  return fraction < 0.5
    ? mixed(DEPARTURE_BLUE, neutralColor, 2 * fraction)
    : mixed(neutralColor, ARRIVAL_AMBER, 2 * fraction - 1);
}
