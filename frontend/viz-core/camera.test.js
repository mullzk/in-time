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

test('the centre stays inside the CH bounds when panned far', () => {
  const camera = new Camera(1300, 800);
  camera.panBy(-10_000_000, 10_000_000);
  assert.ok(camera.centerEast <= CH_BOUNDS_LV95.eastMax);
  assert.ok(camera.centerEast >= CH_BOUNDS_LV95.eastMin);
  assert.ok(camera.centerNorth <= CH_BOUNDS_LV95.northMax);
  assert.ok(camera.centerNorth >= CH_BOUNDS_LV95.northMin);
});
