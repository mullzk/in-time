import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  RadialTravelTimeLayout,
  WORLD_METRES_PER_TRAVEL_SECOND,
} from './radialTravelTime.js';

const CENTRE = { east: 2_600_000, north: 1_200_000 };

const layout = () => new RadialTravelTimeLayout(CENTRE);

const closeTo = (actual, expected, tolerance = 1e-6) =>
  Math.abs(actual - expected) <= tolerance;

test('the place one starts from is the centre of the picture', () => {
  const [east, north] = layout().positionOf(CENTRE, 0);

  assert.equal(east, CENTRE.east);
  assert.equal(north, CENTRE.north);
});

test('a station due north is drawn due north', () => {
  const [east, north] = layout().positionOf(
    { east: CENTRE.east, north: CENTRE.north + 50_000 },
    3_600,
  );

  assert.ok(closeTo(east, CENTRE.east, 1e-6));
  assert.ok(
    closeTo(north, CENTRE.north + 3_600 * WORLD_METRES_PER_TRAVEL_SECOND, 1e-6),
    'the direction is geographic, the distance is the travel time',
  );
});

test('the direction survives, however far away the station really is', () => {
  const near = layout().positionOf(
    { east: CENTRE.east + 1_000, north: CENTRE.north + 1_000 },
    3_600,
  );
  const far = layout().positionOf(
    { east: CENTRE.east + 100_000, north: CENTRE.north + 100_000 },
    3_600,
  );

  assert.ok(closeTo(near[0], far[0], 1e-6));
  assert.ok(closeTo(near[1], far[1], 1e-6));
});

test('the longer the journey, the further out it is drawn', () => {
  const station = { east: CENTRE.east + 30_000, north: CENTRE.north + 10_000 };
  const radiusOf = (travelTime) => {
    const [east, north] = layout().positionOf(station, travelTime);
    return Math.hypot(east - CENTRE.east, north - CENTRE.north);
  };

  assert.ok(radiusOf(1_800) < radiusOf(3_600));
  assert.ok(radiusOf(3_600) < radiusOf(7_200));
  assert.ok(
    closeTo(radiusOf(3_600), 3_600 * WORLD_METRES_PER_TRAVEL_SECOND, 1e-6),
  );
});

test('a slower picture pushes the same journey further out', () => {
  const station = { east: CENTRE.east + 30_000, north: CENTRE.north };
  const slow = new RadialTravelTimeLayout(CENTRE, {
    worldMetresPerTravelSecond: 20,
  });

  const [east] = slow.positionOf(station, 3_600);

  assert.ok(closeTo(east, CENTRE.east + 3_600 * 20, 1e-6));
});

test('a stop sharing the centre coordinate still keeps its distance', () => {
  const [east, north] = layout().positionOf(CENTRE, 600);

  assert.ok(
    closeTo(
      Math.hypot(east - CENTRE.east, north - CENTRE.north),
      600 * WORLD_METRES_PER_TRAVEL_SECOND,
      1e-6,
    ),
  );
});
