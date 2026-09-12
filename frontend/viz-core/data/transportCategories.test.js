import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  CATEGORY_BUS,
  CATEGORY_INTERCITY,
  CATEGORY_REGIO,
  categoryColor,
  categoryLabel,
  categoryTextColor,
  layerOfCategory,
  useColorBlindScheme,
} from './transportCategories.js';

const EVERY_CATEGORY = [0, 1, 2, 3, 4, 5, 6];

const whileColorBlind = (check) => {
  useColorBlindScheme(true);
  try {
    check();
  } finally {
    useColorBlindScheme(false);
  }
};

test('the colour-blind scheme gives every layer a colour of its own', () => {
  whileColorBlind(() => {
    const colorByLayer = new Map(
      EVERY_CATEGORY.map((category) => [
        layerOfCategory(category),
        String(categoryColor(category)),
      ]),
    );
    assert.equal(new Set(colorByLayer.values()).size, colorByLayer.size);
  });
});

test('the colour-blind scheme colours the categories of one layer alike', () => {
  whileColorBlind(() => {
    assert.deepEqual(categoryColor(3), categoryColor(CATEGORY_REGIO));
    assert.deepEqual(categoryColor(4), categoryColor(CATEGORY_REGIO));
  });
});

test('the colour-blind scheme recolours the long-distance red, not the unknown grey', () => {
  whileColorBlind(() => {
    assert.notDeepEqual(categoryColor(CATEGORY_INTERCITY), [207, 10, 44]);
    assert.deepEqual(categoryColor(42), [200, 200, 200]);
  });
});

test('the colour-blind scheme names a text colour for every category', () => {
  whileColorBlind(() => {
    EVERY_CATEGORY.forEach((category) => {
      assert.equal(categoryTextColor(category).length, 3);
    });
  });
});

test('switching back restores the standard scheme', () => {
  whileColorBlind(() => {});
  assert.deepEqual(categoryColor(CATEGORY_BUS), [242, 183, 5]);
  assert.deepEqual(categoryTextColor(CATEGORY_INTERCITY), [255, 255, 255]);
});

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

test('the dark long-distance red carries light text, the bus yellow dark', () => {
  assert.deepEqual(categoryTextColor(CATEGORY_INTERCITY), [255, 255, 255]);
  assert.deepEqual(categoryTextColor(CATEGORY_BUS), [16, 18, 26]);
  assert.deepEqual(
    categoryTextColor(42),
    [16, 18, 26],
    'an unknown category grounds on the fallback grey, which takes dark text',
  );
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
