import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { BACKGROUNDS } from '../viz-core/tiles/tileSource.js';
import { TaktPanel } from './panel.js';

const fixture = (name) => {
  const bytes = readFileSync(
    new URL(`../viz-core/fixtures/${name}`, import.meta.url),
  );
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  );
};

const RAIL_BUFFER = fixture('golden-rail-day.itsb');
const ROAD_BUFFER = fixture('golden-bus-day.itsb');

// The golden blobs carry three stations each; the catalog side of them is a
// published stations list, which the fixtures do not include.
const RAIL_STATIONS = [
  { didok: 1, name: 'Bahnhof', modes: ['rail'], cluster: 1 },
  { didok: 2, name: 'Mittelstadt', modes: ['rail'] },
  { didok: 3, name: 'Endstation', modes: ['rail'] },
];
const ROAD_STATIONS = [
  { didok: 10, name: 'Bahnhof Bus', modes: ['bus'], cluster: 1 },
  { didok: 11, name: 'Dorfplatz', modes: ['bus'] },
  { didok: 12, name: 'Schulhaus', modes: ['bus'] },
];

const context = { camera: {} };

const describeState = (panel) => ({
  positionEngines: panel.positionEngines.length,
  soundEngines: panel.soundEngines.length,
  stations: panel.catalog.entries
    .map((entry) => `${entry.didok}:${entry.name}`)
    .sort(),
  clusters: [...panel.clusterToDidoks.entries()]
    .map(([cluster, didoks]) => [cluster, [...didoks].sort()])
    .sort(),
  didokLookups: panel.soundEngines.map(({ didokToIndex }) => didokToIndex.size),
});

test('a panel without the road blob knows only the rail stations', () => {
  const panel = new TaktPanel(RAIL_BUFFER, RAIL_STATIONS);
  panel.init(context);

  assert.equal(panel.positionEngines.length, 1);
  assert.equal(panel.soundEngines.length, 1);
  assert.deepEqual(panel.stationCatalog().matching('dorfplatz'), []);
});

test('adopting the road schedule after init matches adopting it before', () => {
  const afterInit = new TaktPanel(RAIL_BUFFER, RAIL_STATIONS);
  afterInit.init(context);
  afterInit.adoptSchedule(ROAD_BUFFER, ROAD_STATIONS);

  const beforeInit = new TaktPanel(RAIL_BUFFER, RAIL_STATIONS);
  beforeInit.adoptSchedule(ROAD_BUFFER, ROAD_STATIONS);
  beforeInit.init(context);

  assert.deepEqual(describeState(afterInit), describeState(beforeInit));
  assert.equal(afterInit.positionEngines.length, 2);
  assert.equal(afterInit.stationCatalog().matching('dorfplatz')[0].didok, 11);
});

const backgroundNamed = (id) => BACKGROUNDS.find((entry) => entry.id === id);

// The view opens without the overlay, so these start by switching it on, the
// way a user would before choosing a background.
test('a raster drawing the rails itself switches the network overlay off', () => {
  const panel = new TaktPanel(RAIL_BUFFER, RAIL_STATIONS);
  panel.layers.network = true;

  panel.onBackgroundChange(backgroundNamed('pixel-color'));
  assert.equal(panel.layers.network, false);
});

test('a background without rails leaves the network overlay alone', () => {
  const panel = new TaktPanel(RAIL_BUFFER, RAIL_STATIONS);
  panel.layers.network = true;

  panel.onBackgroundChange(backgroundNamed('black'));
  assert.equal(panel.layers.network, true);

  panel.onBackgroundChange(backgroundNamed('relief'));
  assert.equal(panel.layers.network, true);
});

test('the network overlay stays off once the user switched it back on', () => {
  const panel = new TaktPanel(RAIL_BUFFER, RAIL_STATIONS);
  panel.onBackgroundChange(backgroundNamed('pixel-color'));
  panel.layers.network = true;

  panel.onBackgroundChange(backgroundNamed('pixel-grey'));
  assert.equal(panel.layers.network, false);
});

test('the pulse of the rail blob is ready right after construction', () => {
  const panel = new TaktPanel(RAIL_BUFFER, RAIL_STATIONS);
  panel.init({ camera: { zoomFraction: () => 0.5 } });
  panel.pulseMode = true;

  // The golden rail blob holds one long-distance trip; at 10:10 it stands at
  // its middle station.
  panel.update(36600, 1 / 60);

  assert.equal(panel.longDistancePulse.visiblePulses().length, 1);
});

test('an adopted interchange sounds its rail and bus stops as one place', () => {
  const panel = new TaktPanel(RAIL_BUFFER, RAIL_STATIONS);
  panel.init(context);
  const railOnly = panel.stationSoundEvents(
    panel.stationCatalog().matching('bahnhof')[0],
  );

  panel.adoptSchedule(ROAD_BUFFER, ROAD_STATIONS);
  const merged = panel.stationSoundEvents(
    panel.stationCatalog().matching('bahnhof')[0],
  );

  assert.ok(merged.length > railOnly.length);
  assert.deepEqual(
    merged.map((event) => event.time),
    [...merged.map((event) => event.time)].sort((a, b) => a - b),
  );
});
