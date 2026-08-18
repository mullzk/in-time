import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Camera } from './camera.js';
import { MEDIUM_ZOOM_FRACTION, PanelContext } from './panelContext.js';

const closeTo = (actual, expected, tolerance) =>
  Math.abs(actual - expected) <= tolerance;

const TARGET = [2_600_000, 1_200_000];

const contextWithCamera = () => {
  const camera = new Camera(1300, 800);
  const context = new PanelContext({
    camera,
    projection: null,
    time: null,
    tileLayer: { source: null },
  });
  return { camera, context };
};

test('focusStation raises a zoomed-out view to the medium zoom and centres it', () => {
  const { camera, context } = contextWithCamera();
  assert.ok(camera.zoomFraction() < MEDIUM_ZOOM_FRACTION);
  context.focusStation(...TARGET);
  assert.ok(closeTo(camera.zoomFraction(), MEDIUM_ZOOM_FRACTION, 1e-9));
  assert.ok(closeTo(camera.centerEast, TARGET[0], 1e-6));
  assert.ok(closeTo(camera.centerNorth, TARGET[1], 1e-6));
});

test('focusStation keeps a closer zoom and only recentres', () => {
  const { camera, context } = contextWithCamera();
  camera.setZoomFraction(0.9);
  context.focusStation(...TARGET);
  assert.ok(closeTo(camera.zoomFraction(), 0.9, 1e-9));
  assert.ok(closeTo(camera.centerEast, TARGET[0], 1e-6));
  assert.ok(closeTo(camera.centerNorth, TARGET[1], 1e-6));
});

test('a context that opens on the black ground draws no tiles', () => {
  const context = new PanelContext({ tileLayer: { source: null } });

  assert.equal(context.tilesVisible, false);
});
