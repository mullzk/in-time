import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { Camera } from '../viz-core/camera.js';
import { TimeModel } from '../viz-core/timeModel.js';
import { AusbreitungPanel } from './panel.js';

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
  const panel = new AusbreitungPanel(railBuffer(), STATIONS, startTimeSeconds);
  panel.revealStation(panel.stationCatalog().entryOf(8_500_001));
  return panel;
};

const withTime = (panel) => {
  const time = new TimeModel(0, 24 * 3600);
  panel.init({ time, focusStation: () => {} });
  return time;
};

test('a vehicle runs from its departure until it arrives', () => {
  const panel = panelFrom(10 * 3600);

  assert.equal(panel.ridesRunningAt(10 * 3600 - 1).length, 0, 'not yet');
  assert.equal(panel.ridesRunningAt(10 * 3600 + 5 * 60).length, 1, 'under way');
  assert.equal(
    panel.ridesRunningAt(10 * 3600 + 25 * 60).length,
    0,
    'arrived and gone',
  );
});

test('a vehicle one stays seated in keeps running through its stop', () => {
  const panel = panelFrom(10 * 3600);

  assert.equal(
    panel.ridesRunningAt(10 * 3600 + 10 * 60 + 30).length,
    1,
    'standing at the middle station is still the same ride',
  );
});

test('a running vehicle is somewhere on the ground', () => {
  const panel = panelFrom(10 * 3600);

  const [ride] = panel.ridesRunningAt(10 * 3600 + 5 * 60);
  const { east, north } = panel.positionOfRide(ride, 10 * 3600 + 5 * 60);

  assert.ok(Number.isFinite(east) && Number.isFinite(north));
});

test('a place glows from the moment one arrives, not before', () => {
  const panel = panelFrom(10 * 3600);

  const reachedEarly = panel.placesReachedAt(10 * 3600 + 5 * 60);
  const reachedLater = panel.placesReachedAt(10 * 3600 + 15 * 60);

  assert.equal(reachedEarly.length, 1, 'only where one set off');
  assert.equal(reachedLater.length, 2, 'and the first station reached');
});

test('the clock runs from the departure to the last arrival', () => {
  const panel = panelFrom(10 * 3600);
  const time = withTime(panel);

  panel.revealStation(panel.stationCatalog().entryOf(8_500_001));

  assert.equal(time.rangeStart, 10 * 3600);
  assert.equal(time.rangeEnd, 10 * 3600 + 21 * 60);
  assert.equal(time.current, 10 * 3600, 'and starts over at the departure');
});

test('a new departure time moves the clock with it', () => {
  const panel = panelFrom(10 * 3600);
  const time = withTime(panel);

  panel.setStartTime(9 * 3600);

  assert.equal(panel.startTimeSeconds, 9 * 3600);
  assert.equal(time.rangeStart, 9 * 3600);
  assert.equal(time.current, 9 * 3600);
});

test('a panel nobody chose a station for sets off by itself', () => {
  const panel = new AusbreitungPanel(railBuffer(), STATIONS, 10 * 3600);

  assert.notEqual(panel.startStation, null);
  assert.ok(
    panel.placesReachedAt(24 * 3600).length > 1,
    'and from a station it can travel from',
  );
});

test('the stops of an interchange are one place in the picture', () => {
  const interchange = [
    { didok: 8_500_001, name: 'Anfang', modes: ['rail'] },
    { didok: 8_500_002, name: 'Mitte', modes: ['rail'], cluster: 8_500_002 },
    {
      didok: 8_500_003,
      name: 'Mitte Dorf',
      modes: ['bus'],
      cluster: 8_500_002,
    },
  ];
  const panel = new AusbreitungPanel(railBuffer(), interchange, 10 * 3600);
  panel.revealStation(panel.stationCatalog().entryOf(8_500_001));

  assert.equal(
    panel.placesReachedAt(24 * 3600).length,
    2,
    'where one sets off, and the interchange',
  );
});

test('a place wears the highest-ranking vehicle that reaches it', () => {
  const panel = panelFrom(10 * 3600);

  const reached = panel
    .placesReachedAt(24 * 3600)
    .find((place) => place.entry.didok === 8_500_002);

  assert.equal(reached.category, 0, 'a long-distance train calls there');
});

test('the smaller stops are drawn first, so the trains sit on top', () => {
  const panel = panelFrom(10 * 3600);

  const drawn = panel.placesReachedAt(24 * 3600).map((place) => place.category);

  assert.deepEqual(
    drawn,
    [...drawn].sort((first, second) => second - first),
    'buses first, long-distance last, where one stands on top of all',
  );
});

test('a place is picked where it sits on the screen', () => {
  const panel = panelFrom(10 * 3600);
  const camera = new Camera(800, 600);
  panel.init({ time: new TimeModel(0, 1), camera, focusStation: () => {} });
  panel.update(24 * 3600);
  const target = panel.stationCatalog().entryOf(8_500_002);
  camera.centerOn(target.east, target.north);

  assert.equal(panel.railStationNear(400, 300), target);
  assert.equal(panel.railStationNear(20, 20), null, 'and nowhere else');
});

test('a new spread runs, even after the last one came to rest', () => {
  const panel = panelFrom(10 * 3600);
  const time = withTime(panel);
  time.pause();

  panel.setStartTime(9 * 3600);

  assert.equal(time.playing, true);
});

test('a new starting point pulls the view back to the whole country', () => {
  const panel = panelFrom(10 * 3600);
  const camera = new Camera(800, 600);
  camera.setZoomFraction(1);

  panel.frameStation({ camera });

  assert.equal(camera.zoomFraction(), 0, 'zoomed all the way out again');
});
