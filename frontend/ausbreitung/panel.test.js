import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { Camera } from '../viz-core/camera.js';
import { HEADLINE_WHILE_LOADING } from '../viz-core/headline.js';
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
  const { east, north } = panel.vehiclePosition(ride, 10 * 3600 + 5 * 60);

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

test('a new departure time leaves the spread on screen running', () => {
  const panel = panelFrom(10 * 3600);
  const time = withTime(panel);

  panel.setStartTime(9 * 3600);

  assert.equal(panel.startTimeSeconds, 9 * 3600, 'chosen for the next spread');
  assert.equal(time.rangeStart, 10 * 3600, 'while the clock keeps its stretch');
  assert.equal(time.current, 10 * 3600);
});

test('a restart sets off from the departure now chosen', () => {
  const panel = panelFrom(10 * 3600);
  const time = withTime(panel);
  panel.setStartTime(9 * 3600);

  panel.restart();

  assert.equal(time.rangeStart, 9 * 3600);
  assert.equal(time.current, 9 * 3600);
});

test('a restart plays the same spread again from its first minute', () => {
  const panel = panelFrom(10 * 3600);
  const time = withTime(panel);
  time.seekToTime(10 * 3600 + 15 * 60);

  panel.restart();

  assert.equal(time.current, 10 * 3600);
});

test('a panel nobody chose a station for waits at none', () => {
  const panel = new AusbreitungPanel(railBuffer(), STATIONS, 10 * 3600);

  assert.equal(panel.startStation, null);
  assert.equal(panel.placesReachedAt(24 * 3600).length, 0, 'and shows nothing');
});

test('the station a panel draws is one it can travel from', () => {
  const panel = new AusbreitungPanel(railBuffer(), STATIONS, 10 * 3600);

  panel.revealStation(panel.drawStation());

  assert.notEqual(panel.startStation, null);
  assert.ok(
    panel.placesReachedAt(24 * 3600).length > 1,
    'so the picture is not a single dot',
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

test('a restarted spread runs, even after the last one came to rest', () => {
  const panel = panelFrom(10 * 3600);
  const time = withTime(panel);
  time.pause();

  panel.restart();

  assert.equal(time.playing, true);
});

test('a new starting point pulls the view back to the whole country', () => {
  const panel = panelFrom(10 * 3600);
  const camera = new Camera(800, 600);
  camera.setZoomFraction(1);

  panel.frameStation({ camera });

  assert.equal(camera.zoomFraction(), 0, 'zoomed all the way out again');
});

test('a view linked to a station opens on it, without drawing another', () => {
  const panel = new AusbreitungPanel(
    railBuffer(),
    STATIONS,
    10 * 3600,
    'mitte',
  );

  assert.equal(panel.startsFrom().didok, 8_500_002);
});

test('a station no schedule on hand knows is waited for', () => {
  const panel = new AusbreitungPanel(
    railBuffer(),
    STATIONS,
    10 * 3600,
    'hohenrain-post',
  );
  const time = withTime(panel);

  assert.equal(panel.startsFrom(), null, 'and nothing is drawn meanwhile');
  assert.equal(panel.placesReachedAt(24 * 3600).length, 0);
  assert.equal(time.playing, false, 'the clock has nothing to count');

  panel.noFurtherScheduleIsComing();

  assert.equal(
    panel.startsFrom(),
    null,
    'the name went unanswered, and the view waits to be asked again',
  );
  assert.equal(time.playing, false);
});

test('a spread that gains vehicles carries on where it stood', () => {
  const panel = panelFrom(10 * 3600);
  const time = withTime(panel);
  time.seekToTime(10 * 3600 + 5 * 60);

  panel.adoptSchedule(railBuffer(), STATIONS);

  assert.equal(time.current, 10 * 3600 + 5 * 60);
});

test('the headline says where and when the spread on screen set off', () => {
  const panel = panelFrom(10 * 3600);

  assert.equal(
    panel.headline(),
    'Wenn ich um 10:00 in Anfang losfahre, welche Orte erreiche ich um welche Zeit?',
  );
});

test('the headline keeps the departure until the spread is restarted', () => {
  const panel = panelFrom(10 * 3600);
  withTime(panel);

  panel.setStartTime(9 * 3600);

  assert.match(panel.headline(), /um 10:00/, 'the spread on screen still runs');

  panel.restart();

  assert.match(panel.headline(), /um 09:00/);
});

test('a panel with no spread yet asks no question', () => {
  const panel = new AusbreitungPanel(railBuffer(), STATIONS, 10 * 3600);

  assert.equal(panel.headline(), HEADLINE_WHILE_LOADING);
});
