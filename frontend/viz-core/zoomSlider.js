// Fixed, countable zoom stops for the display tile's slider; the wheel and pinch stay
// continuous and the slider snaps to the nearest stop.
export const ZOOM_STEPS = 7;

const LAST_POSITION = ZOOM_STEPS - 1;

export const zoomSliderPosition = (zoomFraction) =>
  Math.round(zoomFraction * LAST_POSITION);

export const zoomFractionForPosition = (position) => position / LAST_POSITION;
