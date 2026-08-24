import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  ZOOM_STEPS,
  zoomFractionForPosition,
  zoomSliderPosition,
} from './zoomSlider.js';

const LAST_POSITION = ZOOM_STEPS - 1;

test('the zoom fraction maps onto the slider stops', () => {
  assert.equal(zoomSliderPosition(0), 0);
  assert.equal(zoomSliderPosition(1), LAST_POSITION);
  assert.equal(zoomSliderPosition(0.5), LAST_POSITION / 2);
});

test('a fraction between two stops snaps to the nearer one', () => {
  const stopWidth = 1 / LAST_POSITION;
  assert.equal(zoomSliderPosition(stopWidth * 0.49), 0);
  assert.equal(zoomSliderPosition(stopWidth * 0.51), 1);
});

test('every stop maps back to the fraction it came from', () => {
  Array.from({ length: ZOOM_STEPS }, (_, position) => position).forEach(
    (position) => {
      assert.equal(
        zoomSliderPosition(zoomFractionForPosition(position)),
        position,
      );
    },
  );
});

test('the stops span the whole zoom range', () => {
  assert.equal(zoomFractionForPosition(0), 0);
  assert.equal(zoomFractionForPosition(LAST_POSITION), 1);
});
