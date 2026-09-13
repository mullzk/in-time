import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  drawRank,
  INTERREGIO,
  LONG_DISTANCE,
  REGIONAL,
  TRAIN_CLASSES,
  trainClassOf,
} from './trainClasses.js';

const classById = (id) =>
  TRAIN_CLASSES.find((trainClass) => trainClass.id === id);

test('IC/EC, IR and regional rail each form a class of their own', () => {
  assert.equal(trainClassOf(0), LONG_DISTANCE);
  assert.equal(trainClassOf(1), INTERREGIO);
  assert.equal(trainClassOf(2), REGIONAL);
  assert.equal(trainClassOf(3), REGIONAL, 'the S-Bahn rides with Regio');
});

test('other rail, trams and buses belong to no class and are not shown', () => {
  [4, 5, 6].forEach((category) => {
    assert.equal(trainClassOf(category), null);
  });
});

test('the classes run from the innermost hub layer to the outermost', () => {
  assert.deepEqual(
    TRAIN_CLASSES.map(({ id }) => id),
    [LONG_DISTANCE, INTERREGIO, REGIONAL],
  );
});

test('an IR is drawn as large as an IC/EC, but in the grey of regional rail', () => {
  const longDistance = classById(LONG_DISTANCE);
  const interregio = classById(INTERREGIO);
  const regional = classById(REGIONAL);
  assert.equal(interregio.discDiameterPixels, longDistance.discDiameterPixels);
  assert.ok(interregio.discDiameterPixels > regional.discDiameterPixels);
  assert.deepEqual(interregio.discColor, regional.discColor);
  assert.notDeepEqual(interregio.discColor, longDistance.discColor);
});

test('regional trains are drawn first and IC/EC last, on top', () => {
  assert.ok(drawRank(REGIONAL) < drawRank(INTERREGIO));
  assert.ok(drawRank(INTERREGIO) < drawRank(LONG_DISTANCE));
});
