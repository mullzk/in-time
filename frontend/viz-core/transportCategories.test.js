import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  CATEGORY_BUS,
  CATEGORY_INTERCITY,
  categoryColor,
  categoryLabel,
  layerOfCategory,
} from './transportCategories.js';

test('a category is named, an unknown one generically', () => {
  assert.equal(categoryLabel(CATEGORY_INTERCITY), 'Fernverkehr');
  assert.equal(categoryLabel(1), 'InterRegio');
  assert.equal(categoryLabel(CATEGORY_BUS), 'Bus');
  assert.equal(categoryLabel(42), 'Fahrt');
});

test('every category has a colour, an unknown one a grey', () => {
  assert.deepEqual(categoryColor(CATEGORY_BUS), [242, 183, 5]);
  assert.deepEqual(categoryColor(42), [200, 200, 200]);
});

test('the rail categories fall into three layers, tram and bus into their own', () => {
  assert.equal(layerOfCategory(CATEGORY_INTERCITY), 'fernverkehr');
  assert.equal(layerOfCategory(1), 'interregio');
  assert.equal(layerOfCategory(2), 'regionalverkehr');
  assert.equal(layerOfCategory(4), 'regionalverkehr');
  assert.equal(layerOfCategory(CATEGORY_BUS), 'bus');
  assert.equal(
    layerOfCategory(42),
    'regionalverkehr',
    'an unknown category is still shown, on the layer that carries the rest',
  );
});
