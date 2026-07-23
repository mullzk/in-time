import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  Camera,
  CH_BOUNDS_LV95,
  SCALE_MAX_PIXELS_PER_METRE,
} from './camera.js';

const closeTo = (actual, expected, tolerance) =>
  Math.abs(actual - expected) <= tolerance;

test('screen<->world is a round trip', () => {
  const camera = new Camera(1300, 800);
  const worldPoint = [2_600_000, 1_200_000];
  const [east, north] = camera.screenToWorld(
    ...camera.worldToScreen(...worldPoint),
  );
  assert.ok(closeTo(east, worldPoint[0], 1e-6));
  assert.ok(closeTo(north, worldPoint[1], 1e-6));
});

test('the camera centre maps to the viewport centre', () => {
  const camera = new Camera(1300, 800);
  const [x, y] = camera.worldToScreen(camera.centerEast, camera.centerNorth);
  assert.ok(closeTo(x, 650, 1e-6));
  assert.ok(closeTo(y, 400, 1e-6));
});

test('north points up: a more northern point maps to a smaller screen y', () => {
  const camera = new Camera(1300, 800);
  const [, southY] = camera.worldToScreen(
    camera.centerEast,
    camera.centerNorth - 10_000,
  );
  const [, northY] = camera.worldToScreen(
    camera.centerEast,
    camera.centerNorth + 10_000,
  );
  assert.ok(northY < southY);
});

test('zoomAt keeps the world point under the cursor fixed', () => {
  const camera = new Camera(1300, 800);
  const cursor = [900, 300];
  const before = camera.screenToWorld(...cursor);
  camera.zoomAt(...cursor, 1.8);
  const after = camera.screenToWorld(...cursor);
  assert.ok(closeTo(after[0], before[0], 0.5));
  assert.ok(closeTo(after[1], before[1], 0.5));
});

test('scale is clamped at the maximum zoom-in', () => {
  const camera = new Camera(1300, 800);
  for (let step = 0; step < 40; step += 1) {
    camera.zoomAt(650, 400, 2);
  }
  assert.ok(closeTo(camera.scale, SCALE_MAX_PIXELS_PER_METRE, 1e-9));
});

test('scale is clamped at the maximum zoom-out (CH + 10% fits)', () => {
  const camera = new Camera(1300, 800);
  for (let step = 0; step < 40; step += 1) {
    camera.zoomAt(650, 400, 0.5);
  }
  const fit = Math.min(
    1300 / ((CH_BOUNDS_LV95.eastMax - CH_BOUNDS_LV95.eastMin) * 1.1),
    800 / ((CH_BOUNDS_LV95.northMax - CH_BOUNDS_LV95.northMin) * 1.1),
  );
  assert.ok(closeTo(camera.scale, fit, 1e-9));
});

test('worldPerPixel is the inverse of the scale', () => {
  const camera = new Camera(1300, 800);
  assert.ok(closeTo(camera.worldPerPixel(), 1 / camera.scale, 1e-12));
});

test('visibleWorldBounds spans the viewport symmetrically around the centre', () => {
  const camera = new Camera(1300, 800);
  const bounds = camera.visibleWorldBounds();
  const halfWidthMetres = 1300 / 2 / camera.scale;
  const halfHeightMetres = 800 / 2 / camera.scale;
  assert.ok(closeTo(bounds.eastMin, camera.centerEast - halfWidthMetres, 1e-6));
  assert.ok(closeTo(bounds.eastMax, camera.centerEast + halfWidthMetres, 1e-6));
  assert.ok(
    closeTo(bounds.northMin, camera.centerNorth - halfHeightMetres, 1e-6),
  );
  assert.ok(
    closeTo(bounds.northMax, camera.centerNorth + halfHeightMetres, 1e-6),
  );
});

test('the corners of visibleWorldBounds map to the viewport corners', () => {
  const camera = new Camera(1300, 800);
  const bounds = camera.visibleWorldBounds();
  const [leftX, topY] = camera.worldToScreen(bounds.eastMin, bounds.northMax);
  const [rightX, bottomY] = camera.worldToScreen(
    bounds.eastMax,
    bounds.northMin,
  );
  assert.ok(closeTo(leftX, 0, 1e-6));
  assert.ok(closeTo(topY, 0, 1e-6));
  assert.ok(closeTo(rightX, 1300, 1e-6));
  assert.ok(closeTo(bottomY, 800, 1e-6));
});

test('zoomFraction is 0 at the fit and 1 at maximum zoom-in', () => {
  const camera = new Camera(1300, 800);
  assert.ok(closeTo(camera.zoomFraction(), 0, 1e-9));
  for (let step = 0; step < 40; step += 1) {
    camera.zoomAt(650, 400, 2);
  }
  assert.ok(closeTo(camera.zoomFraction(), 1, 1e-9));
});

test('setZoomFraction round-trips through zoomFraction', () => {
  const camera = new Camera(1300, 800);
  [0, 0.25, 0.5, 0.75, 1].forEach((fraction) => {
    camera.setZoomFraction(fraction);
    assert.ok(closeTo(camera.zoomFraction(), fraction, 1e-9));
  });
});

test('setZoomFraction is logarithmic: half the fraction is the geometric mean scale', () => {
  const camera = new Camera(1300, 800);
  camera.setZoomFraction(0);
  const outScale = camera.scale;
  camera.setZoomFraction(1);
  const inScale = camera.scale;
  camera.setZoomFraction(0.5);
  assert.ok(closeTo(camera.scale, Math.sqrt(outScale * inScale), 1e-9));
});

test('fullyZoomedOut holds at the fit and breaks after one zoom-in step', () => {
  const camera = new Camera(1300, 800);
  assert.ok(camera.fullyZoomedOut());
  camera.zoomAt(650, 400, 1.1);
  assert.ok(!camera.fullyZoomedOut());
});

test('the centre stays inside the CH bounds when panned far', () => {
  const camera = new Camera(1300, 800);
  camera.panBy(-10_000_000, 10_000_000);
  assert.ok(camera.centerEast <= CH_BOUNDS_LV95.eastMax);
  assert.ok(camera.centerEast >= CH_BOUNDS_LV95.eastMin);
  assert.ok(camera.centerNorth <= CH_BOUNDS_LV95.northMax);
  assert.ok(camera.centerNorth >= CH_BOUNDS_LV95.northMin);
});
