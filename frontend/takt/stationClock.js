// The clock in the picture's top right corner, drawn after the Swiss railway
// station clock: a dial in a dark case, bar markers, tapered hands. It carries
// no second hand -- the panel runs time at whatever tempo the user picks, where
// a sweeping second hand would only smear. Around the sunset and the sunrise
// of the day being shown it turns its palette over into a night one.

const DAY_PALETTE = {
  case: [16, 18, 26],
  dial: [255, 255, 255],
  mark: [16, 18, 26],
};
// Through the night the dial turns dark and the marks and hands turn light, so
// the clock stops being the brightest thing on a picture of a sleeping country.
const NIGHT_PALETTE = {
  case: [8, 9, 13],
  dial: [30, 33, 44],
  mark: [226, 230, 240],
};

// Sunrise and sunset in local time (daylight saving included) for the middle of
// each month, computed for Zurich and taken as good enough for the whole
// country: the ends of Switzerland part by about a quarter of an hour, which is
// less than the twilight the palette fades across anyway.
const SUN_BY_MONTH = [
  [8.15, 17.03],
  [7.53, 17.82],
  [6.67, 18.52],
  [6.63, 20.23],
  [5.83, 20.93],
  [5.48, 21.42],
  [5.75, 21.33],
  [6.37, 20.67],
  [7.07, 19.67],
  [7.73, 18.67],
  [7.52, 16.87],
  [8.12, 16.6],
];

// The changeover is drawn out over dusk and dawn, or it would flick from one
// palette to the other mid-frame at the tempi the panel plays the day at.
const TWILIGHT_HOURS = 0.5;
const HOURS_PER_DAY = 24;

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

// An operating day runs past midnight, the clock on the wall does not.
const hourOfDay = (timeOfDaySeconds) =>
  (timeOfDaySeconds / 3600) % HOURS_PER_DAY;

// Month of an ISO date, without going through Date: the string is the service
// day as the build named it, and parsing it would only invite a time zone.
const sunOfServiceDate = (serviceDateIso) =>
  SUN_BY_MONTH[Number(serviceDateIso.slice(5, 7)) - 1];

const nightAmount = (timeOfDaySeconds, [sunrise, sunset]) => {
  const hour = hourOfDay(timeOfDaySeconds);
  const afterSunset = (hour - sunset) / TWILIGHT_HOURS;
  const beforeSunrise = (sunrise - hour) / TWILIGHT_HOURS;
  return Math.max(clamp(afterSunset, 0, 1), clamp(beforeSunrise, 0, 1));
};

const blended = (day, night, amount) =>
  day.map((channel, index) => channel + (night[index] - channel) * amount);

const paletteAt = (timeOfDaySeconds, serviceDateIso) => {
  const amount = nightAmount(
    timeOfDaySeconds,
    sunOfServiceDate(serviceDateIso),
  );
  return {
    case: blended(DAY_PALETTE.case, NIGHT_PALETTE.case, amount),
    dial: blended(DAY_PALETTE.dial, NIGHT_PALETTE.dial, amount),
    mark: blended(DAY_PALETTE.mark, NIGHT_PALETTE.mark, amount),
  };
};

const drawMarkers = (p, radius, markColor) => {
  p.noStroke();
  p.fill(...markColor);
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

export function drawStationClock(p, timeOfDaySeconds, serviceDateIso) {
  const { x, y, radius } = centreOfClock(p.width, p.height);
  const dialRadius = radius * DIAL_RADIUS_IN_CASE;
  const turns = handTurns(timeOfDaySeconds);
  const palette = paletteAt(timeOfDaySeconds, serviceDateIso);

  p.push();
  p.translate(x, y);
  p.noStroke();
  p.fill(...palette.case);
  p.circle(0, 0, radius * 2);
  p.fill(...palette.dial);
  p.circle(0, 0, dialRadius * 2);
  drawMarkers(p, dialRadius, palette.mark);
  drawHand(p, dialRadius, turns.hour, HOUR_HAND);
  drawHand(p, dialRadius, turns.minute, MINUTE_HAND);
  p.pop();
}
