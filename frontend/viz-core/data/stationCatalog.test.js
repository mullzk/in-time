import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  normalizeForSearch,
  StationCatalog,
  StationEntry,
} from './stationCatalog.js';

test('normalizeForSearch folds case, diacritics, dots and commas', () => {
  assert.equal(normalizeForSearch('Zürich HB'), 'zurich hb');
  assert.equal(normalizeForSearch('St. Gallen'), 'st gallen');
  assert.equal(normalizeForSearch('Bern, Bümpliz Nord'), 'bern bumpliz nord');
});

const catalog = (...names) =>
  new StationCatalog(
    names.map((name, index) => new StationEntry(index + 1, name, 0, 0)),
  );

test('a comma between words does not break the query', () => {
  const found = catalog('Bern', 'Bern, Bümpliz Nord').matching('bern bümpliz');
  assert.deepEqual(
    found.map((entry) => entry.name),
    ['Bern, Bümpliz Nord'],
  );
});

test('a dot in the name does not break the query', () => {
  const found = catalog('St. Gallen', 'Sarnen').matching('st gallen');
  assert.deepEqual(
    found.map((entry) => entry.name),
    ['St. Gallen'],
  );
});

test('diacritics in the name are searchable without them', () => {
  const found = catalog('Zürich HB', 'Genève').matching('zurich');
  assert.deepEqual(
    found.map((entry) => entry.name),
    ['Zürich HB'],
  );
});

test('name prefix ranks above a longer prefix match', () => {
  const found = catalog('Bern, Bümpliz Nord', 'Bern').matching('bern');
  assert.deepEqual(
    found.map((entry) => entry.name),
    ['Bern', 'Bern, Bümpliz Nord'],
  );
});

test('a word start ranks above a mid-word substring', () => {
  const found = catalog('Interlaken', 'Bad Lake').matching('lake');
  assert.deepEqual(
    found.map((entry) => entry.name),
    ['Bad Lake', 'Interlaken'],
  );
});

test('an empty query yields no suggestions', () => {
  assert.deepEqual(catalog('Bern').matching('   '), []);
});

test('the suggestion count is capped', () => {
  const wide = new StationCatalog(
    Array.from(
      { length: 20 },
      (_, index) => new StationEntry(index + 1, `Bahnhof ${index}`, 0, 0),
    ),
    { maxSuggestions: 5 },
  );
  assert.equal(wide.matching('bahnhof').length, 5);
});

const published = (...sets) => {
  const catalog = new StationCatalog([]);
  sets.forEach(([stations, points]) => {
    catalog.addPublished(stations, points);
  });
  return catalog;
};

test('addPublished merges by didok, keeping the coordinate added first', () => {
  const merged = published(
    [[{ didok: 1, name: 'Bern' }], [[2_600_000, 1_200_000]]],
    [
      [
        { didok: 1, name: 'Bern' },
        { didok: 9, name: 'Busdorf' },
      ],
      [
        [2_600_050, 1_200_050],
        [2_610_000, 1_210_000],
      ],
    ],
  );

  const bern = merged.matching('bern');
  assert.equal(bern.length, 1);
  assert.deepEqual([bern[0].east, bern[0].north], [2_600_000, 1_200_000]);

  const busdorf = merged.matching('busdorf');
  assert.equal(busdorf.length, 1);
  assert.equal(busdorf[0].didok, 9);
});

test('addPublished unions the modes of a didok across both sets', () => {
  const catalog = published(
    [
      [
        { didok: 1, name: 'Bahnhof', modes: ['rail'] },
        { didok: 2, name: 'Umsteige', modes: ['tram'] },
      ],
      [
        [1, 1],
        [2, 2],
      ],
    ],
    [
      [
        { didok: 2, name: 'Umsteige', modes: ['bus'] },
        { didok: 3, name: 'Bushalt', modes: ['bus'] },
      ],
      [
        [2, 2],
        [3, 3],
      ],
    ],
  );
  const only = (name) => catalog.matching(name)[0];
  assert.deepEqual(only('bahnhof').modes, ['rail']);
  assert.deepEqual([...only('umsteige').modes].sort(), ['bus', 'tram']);
  assert.deepEqual(only('bushalt').modes, ['bus']);
});

test('addPublished carries a stations cluster and adopts it across sets', () => {
  const catalog = published(
    [
      [
        { didok: 1, name: 'Bahnhof', modes: ['rail'], cluster: 1 },
        { didok: 4, name: 'Alleine', modes: ['rail'] },
      ],
      [
        [1, 1],
        [4, 4],
      ],
    ],
    [[{ didok: 2, name: 'Bushalt', modes: ['bus'], cluster: 1 }], [[2, 2]]],
  );
  const only = (name) => catalog.matching(name)[0];
  assert.equal(only('bahnhof').cluster, 1);
  assert.equal(only('bushalt').cluster, 1);
  assert.equal(only('alleine').cluster, null);
});

test('a set added after the first searches merges and indexes just the same', () => {
  const catalog = published([
    [{ didok: 1, name: 'Bahnhof', modes: ['rail'], cluster: 1 }],
    [[2_600_000, 1_200_000]],
  ]);
  assert.deepEqual(catalog.matching('bushalt'), []);

  catalog.addPublished(
    [
      { didok: 1, name: 'Bahnhof', modes: ['bus'], cluster: 1 },
      { didok: 7, name: 'Bushalt', modes: ['bus'], cluster: 1 },
    ],
    [
      [2_600_050, 1_200_050],
      [2_600_090, 1_200_090],
    ],
  );

  const bahnhof = catalog.matching('bahnhof')[0];
  assert.deepEqual([...bahnhof.modes].sort(), ['bus', 'rail']);
  assert.deepEqual([bahnhof.east, bahnhof.north], [2_600_000, 1_200_000]);
  assert.equal(catalog.matching('bushalt')[0].didok, 7);
});
