/**
 * The colour of the half-hourly Takt phase: one colour while the trains fan out
 * from the nodes, another while they gather back in, and the element's own
 * neutral colour at the quarter, where the two halves meet.
 */
const HALF_HOUR_SECONDS = 1800;
// Named for the phase rather than the hue: which colours read as fanning out
// and gathering in is still being settled. The two sit a short way apart in
// hue, so the changeover at the node minute registers without jumping.
export const PULS_DEPARTURE_COLOR = [25, 145, 110];
export const PULS_ARRIVAL_COLOR = [25, 110, 170];

const mixed = (from, to, amount) =>
  from.map((channel, index) => channel + (to[index] - channel) * amount);

const halfHourFraction = (currentTimeSeconds) =>
  (currentTimeSeconds % HALF_HOUR_SECONDS) / HALF_HOUR_SECONDS;

export function taktPhaseColor(neutralColor, currentTimeSeconds) {
  const fraction = halfHourFraction(currentTimeSeconds);
  return fraction < 0.5
    ? mixed(PULS_DEPARTURE_COLOR, neutralColor, 2 * fraction)
    : mixed(neutralColor, PULS_ARRIVAL_COLOR, 2 * fraction - 1);
}
