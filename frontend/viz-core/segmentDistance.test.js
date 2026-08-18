import assert from 'node:assert/strict';
import { test } from 'node:test';
import { distanceToSegmentSquared } from './segmentDistance.js';

const distance = (...arguments_) =>
  Math.sqrt(distanceToSegmentSquared(...arguments_));

test('a point on the segment is no distance from it', () => {
  assert.equal(distance(5, 0, 0, 0, 10, 0), 0);
});

test('a point beside the segment measures across it', () => {
  assert.equal(distance(5, 3, 0, 0, 10, 0), 3);
});

test('a point beyond an end measures to that end, not to the line', () => {
  assert.equal(distance(14, 3, 0, 0, 10, 0), 5);
  assert.equal(distance(-4, 3, 0, 0, 10, 0), 5);
});

test('a segment of no length measures to its point', () => {
  assert.equal(distance(3, 4, 0, 0, 0, 0), 5);
});
