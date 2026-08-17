import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { ReisezeitPanel } from './panel.js';

// The golden rail fixture: three stations, a trip calling at all three (10:00 →
// 10:10, on again at 10:11 → 10:21) and a second trip from the middle station at
// 11:06. Their didoks are ours to name, since a blob carries only indices.
const railBuffer = () => {
  const bytes = readFileSync(
    new URL('../viz-core/fixtures/golden-rail-day.itsb', import.meta.url),
  );
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  );
};

const STATIONS = [
  { didok: 8_500_001, name: 'Anfang', modes: ['rail'] },
  { didok: 8_500_002, name: 'Mitte', modes: ['rail'] },
  { didok: 8_500_003, name: 'Ende', modes: ['rail'] },
];

const panelFrom = (startTimeSeconds) => {
  const panel = new ReisezeitPanel(railBuffer(), STATIONS, startTimeSeconds);
  panel.revealStation(panel.stationCatalog().entryOf(8_500_001));
  return panel;
};

const stationIndex = (panel, didok) => panel.placeOfDidok(didok);

test('a place is described by its name and its travel time', () => {
  const panel = panelFrom(10 * 3600);

  assert.deepEqual(
    panel.describeTarget({
      kind: 'station',
      index: stationIndex(panel, 8_500_002),
    }),
    ['Mitte', '10 min Reisezeit'],
  );
});

test('the place one starts from is named as that', () => {
  const panel = panelFrom(10 * 3600);

  assert.deepEqual(
    panel.describeTarget({
      kind: 'station',
      index: stationIndex(panel, 8_500_001),
    }),
    ['Anfang', 'Ausgangspunkt'],
  );
});

test('a leg says where it goes, what runs it and how long it takes', () => {
  const panel = panelFrom(10 * 3600);

  const [route, vehicle] = panel.describeTarget({
    kind: 'leg',
    index: stationIndex(panel, 8_500_002),
  });

  assert.equal(route, 'Anfang → Mitte');
  assert.equal(vehicle, 'Fernverkehr, 10 min');
});

test('staying seated is a leg without a wait', () => {
  const panel = panelFrom(10 * 3600);

  const [, , wait] = panel.describeTarget({
    kind: 'leg',
    index: stationIndex(panel, 8_500_003),
  });

  assert.equal(wait, 'ohne Wartezeit');
});

test('a wait before the first departure is counted from the start time', () => {
  const panel = panelFrom(9 * 3600 + 45 * 60);

  const [, , wait] = panel.describeTarget({
    kind: 'leg',
    index: stationIndex(panel, 8_500_002),
  });

  assert.equal(wait, '15 min warten');
});

test('the stops of an interchange share one place in the picture', () => {
  const interchange = [
    { didok: 8_500_001, name: 'Anfang', modes: ['rail'] },
    { didok: 8_500_002, name: 'Mitte', modes: ['rail'], cluster: 8_500_002 },
    {
      didok: 8_500_003,
      name: 'Mitte Dorf',
      modes: ['rail'],
      cluster: 8_500_002,
    },
  ];
  const panel = new ReisezeitPanel(railBuffer(), interchange, 10 * 3600);
  panel.revealStation(panel.stationCatalog().entryOf(8_500_001));

  assert.equal(
    panel.placeOfDidok(8_500_002),
    panel.placeOfDidok(8_500_003),
    'both stops of the interchange are the same place',
  );
  assert.equal(panel.places.length, 2, 'the start and the interchange');
});

test('a panel nobody chose a station for sets off by itself', () => {
  const panel = new ReisezeitPanel(railBuffer(), STATIONS, 10 * 3600);

  assert.notEqual(panel.startStation, null, 'a start station was picked');
  assert.ok(
    panel.places.length > 1,
    'and one it can travel from, so the picture is not a single dot',
  );
});

test('the rings reach past the furthest place', () => {
  const panel = panelFrom(10 * 3600);

  assert.equal(panel.hourRings, 1, '21 minutes of travel still draw one ring');
});
