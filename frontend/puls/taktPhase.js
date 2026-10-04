/**
 * The colour of the half-hourly Takt phase: one colour while the trains fan out
 * from the nodes, another while they gather back in, and the element's own
 * neutral colour at the quarter, where the two halves meet.
 */
const HALF_HOUR_SECONDS = 1800;

// Named for the phase rather than the hue: which colours read as fanning out
// and gathering in is still being settled. The two sit a short way apart in
// hue, so the changeover at the node minute registers without jumping. A train
// carries its phase on a disc of a few pixels, a hub on one the width of a
// city, which is why the trains are given the louder pair.
export const PULS_TRAIN_DEPARTURE_COLOR = [0, 220, 130];
export const PULS_TRAIN_ARRIVAL_COLOR = [0, 135, 255];
export const PULS_HUB_DEPARTURE_COLOR = [25, 145, 110];
export const PULS_HUB_ARRIVAL_COLOR = [25, 110, 170];

export const DEPARTING = 'departing';
export const ARRIVING = 'arriving';

const mixed = (from, to, amount) =>
  from.map((channel, index) => channel + (to[index] - channel) * amount);

const halfHourFraction = (currentTimeSeconds) =>
  (currentTimeSeconds % HALF_HOUR_SECONDS) / HALF_HOUR_SECONDS;

export const phaseOfTheHalfHour = (currentTimeSeconds) =>
  halfHourFraction(currentTimeSeconds) < 0.5 ? DEPARTING : ARRIVING;

// Nothing at the node minute, all of it at the quarter.
const towardsTheQuarter = (currentTimeSeconds) => {
  const fraction = halfHourFraction(currentTimeSeconds);
  return fraction < 0.5 ? 2 * fraction : 2 - 2 * fraction;
};

// Above one, so the phase holds its colour over most of its quarter and gives
// it up over the last stretch instead of washing out evenly.
const FADE_EXPONENT = 3;

const phaseColor = (
  departureColor,
  arrivalColor,
  neutralColor,
  currentTimeSeconds,
) =>
  mixed(
    phaseOfTheHalfHour(currentTimeSeconds) === DEPARTING
      ? departureColor
      : arrivalColor,
    neutralColor,
    towardsTheQuarter(currentTimeSeconds) ** FADE_EXPONENT,
  );

export const trainPhaseColor = (neutralColor, currentTimeSeconds) =>
  phaseColor(
    PULS_TRAIN_DEPARTURE_COLOR,
    PULS_TRAIN_ARRIVAL_COLOR,
    neutralColor,
    currentTimeSeconds,
  );

export const hubPhaseColor = (neutralColor, currentTimeSeconds) =>
  phaseColor(
    PULS_HUB_DEPARTURE_COLOR,
    PULS_HUB_ARRIVAL_COLOR,
    neutralColor,
    currentTimeSeconds,
  );
