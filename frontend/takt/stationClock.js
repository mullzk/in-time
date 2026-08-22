// The clock in the picture's top right corner, drawn after the Swiss railway
// station clock: white dial in a black case, bar markers, tapered black hands.
// It carries no second hand -- the panel runs time at whatever tempo the user
// picks, where a sweeping second hand would only smear.

const CASE_COLOR = [16, 18, 26];
const DIAL_COLOR = [255, 255, 255];
const MARK_COLOR = [16, 18, 26];

const DIAMETER_FRACTION_OF_SHORTER_SIDE = 0.11;
const SMALLEST_DIAMETER_PIXELS = 56;
const LARGEST_DIAMETER_PIXELS = 104;

const MARGIN_PIXELS = 12;
// Below this canvas width the station search grows into the corner, so the
// clock steps down below the top bar rather than under the search field.
const WIDTH_SHARING_THE_TOP_BAR_ROW_PIXELS = 560;
const TOP_BAR_ROW_PIXELS = 52;

// Everything below is a fraction of the dial's radius.
const DIAL_RADIUS_IN_CASE = 0.955;

const MARKER_OUTER = 0.94;
const HOUR_MARKER_INNER = 0.72;
const HOUR_MARKER_WIDTH = 0.098;
const MINUTE_MARKER_INNER = 0.855;
const MINUTE_MARKER_WIDTH = 0.042;

const HOUR_HAND = {
  length: 0.55,
  tail: 0.13,
  halfWidthAtCentre: 0.055,
  halfWidthAtTip: 0.07,
};
const MINUTE_HAND = {
  length: 0.83,
  tail: 0.13,
  halfWidthAtCentre: 0.045,
  halfWidthAtTip: 0.058,
};

const FULL_TURN = Math.PI * 2;
const MINUTES_PER_TURN = 60;
const HOURS_PER_TURN = 12;

const MINUTE_POSITIONS = Array.from(
  { length: MINUTES_PER_TURN },
  (_, minute) => minute,
);

const clamp = (value, lowest, highest) =>
  Math.min(highest, Math.max(lowest, value));

const dialRadiusPixels = (canvasWidth, canvasHeight) =>
  clamp(
    Math.min(canvasWidth, canvasHeight) * DIAMETER_FRACTION_OF_SHORTER_SIDE,
    SMALLEST_DIAMETER_PIXELS,
    LARGEST_DIAMETER_PIXELS,
  ) / 2;

const centreOfClock = (canvasWidth, canvasHeight) => {
  const radius = dialRadiusPixels(canvasWidth, canvasHeight);
  const topOfRow =
    canvasWidth < WIDTH_SHARING_THE_TOP_BAR_ROW_PIXELS
      ? MARGIN_PIXELS + TOP_BAR_ROW_PIXELS
      : MARGIN_PIXELS;
  return {
    x: canvasWidth - MARGIN_PIXELS - radius,
    y: topOfRow + radius,
    radius,
  };
};

// Both hands run continuously. The station clock's minute hand steps from
// minute to minute, but the panel plays the day at a tempo of the viewer's
// choosing, where that step turns into a stutter several times a second.
const handTurns = (timeOfDaySeconds) => ({
  minute: (timeOfDaySeconds / 60 / MINUTES_PER_TURN) % 1,
  hour: (timeOfDaySeconds / 3600 / HOURS_PER_TURN) % 1,
});

const drawMarkers = (p, radius) => {
  p.noStroke();
  p.fill(...MARK_COLOR);
  MINUTE_POSITIONS.forEach((minute) => {
    const onTheHour = minute % 5 === 0;
    const width =
      (onTheHour ? HOUR_MARKER_WIDTH : MINUTE_MARKER_WIDTH) * radius;
    const inner =
      (onTheHour ? HOUR_MARKER_INNER : MINUTE_MARKER_INNER) * radius;
    const outer = MARKER_OUTER * radius;
    p.push();
    p.rotate((minute / MINUTES_PER_TURN) * FULL_TURN);
    p.rect(-width / 2, -outer, width, outer - inner);
    p.pop();
  });
};

const drawHand = (p, radius, turns, hand) => {
  p.push();
  p.rotate(turns * FULL_TURN);
  p.quad(
    -hand.halfWidthAtCentre * radius,
    hand.tail * radius,
    hand.halfWidthAtCentre * radius,
    hand.tail * radius,
    hand.halfWidthAtTip * radius,
    -hand.length * radius,
    -hand.halfWidthAtTip * radius,
    -hand.length * radius,
  );
  p.pop();
};

export function drawStationClock(p, timeOfDaySeconds) {
  const { x, y, radius } = centreOfClock(p.width, p.height);
  const dialRadius = radius * DIAL_RADIUS_IN_CASE;
  const turns = handTurns(timeOfDaySeconds);

  p.push();
  p.translate(x, y);
  p.noStroke();
  p.fill(...CASE_COLOR);
  p.circle(0, 0, radius * 2);
  p.fill(...DIAL_COLOR);
  p.circle(0, 0, dialRadius * 2);
  drawMarkers(p, dialRadius);
  drawHand(p, dialRadius, turns.hour, HOUR_HAND);
  drawHand(p, dialRadius, turns.minute, MINUTE_HAND);
  p.pop();
}
