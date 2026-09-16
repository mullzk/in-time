import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { VehiclePositionEngine } from '../viz-core/travel/vehiclePositionEngine.js';
import { HUB_STEADY_COLOR } from './hubLayers.js';
import { PulsPanel } from './panel.js';
import { drawRank, trainClassById, trainClassOf } from './trainClasses.js';

const bytes = readFileSync(
  new URL('../viz-core/fixtures/golden-rail-day.itsb', import.meta.url),
);
const RAIL_BUFFER = bytes.buffer.slice(
  bytes.byteOffset,
  bytes.byteOffset + bytes.byteLength,
);
const RAIL_STATIONS = [
  { didok: 8503000, name: 'Zürich HB', cluster: 8503000 },
  { didok: 2, name: 'Mittelstadt' },
  { didok: 3, name: 'Endstation' },
];

const recordingClock = () => {
  const shown = [];
  return { shown, show: (seconds) => shown.push(seconds) };
};

const recordingLegend = () => {
  const schemes = [];
  return { schemes, showPhaseColors: (inUse) => schemes.push(inUse) };
};

const recordingSketch = () => {
  const fills = [];
  const strokes = [];
  const ignored = () => {};
  return {
    fills,
    strokes,
    fill: (...color) => fills.push(color),
    stroke: (...color) => strokes.push(color),
    noFill: ignored,
    noStroke: ignored,
    strokeWeight: ignored,
    circle: ignored,
    beginShape: ignored,
    vertex: ignored,
    endShape: ignored,
  };
};

const WORLD_CONTEXT = { camera: { worldPerPixel: () => 1 } };

// Hub layers carry an alpha beside their colour, trains and the network do not.
const hubColorsDrawnBy = ({ fills, strokes }) =>
  [...fills, ...strokes].filter((color) => color.length === 4);

const trainColorsDrawnBy = ({ fills }) =>
  fills.filter((color) => color.length === 3);

const drawnAt = (panel, momentSeconds) => {
  const sketch = recordingSketch();
  panel.update(momentSeconds, 0);
  panel.drawWorld(sketch, WORLD_CONTEXT);
  return sketch;
};

const HALF_HOUR_SECONDS = 30 * 60;
const QUARTER_SECONDS = 15 * 60;

// At the quarter the phase colour is the element's own colour, so a test that
// tells the two schemes apart has to stay away from it.
const momentAwayFromTheQuarter = (momentSeconds) =>
  momentSeconds % HALF_HOUR_SECONDS === QUARTER_SECONDS
    ? momentSeconds + 1
    : momentSeconds;

const pressPhaseColorKey = (panel) => {
  panel.keyBindings().c();
};

const busiestMoment = () => {
  const engine = new VehiclePositionEngine(RAIL_BUFFER);
  const moments = engine.trips.flatMap(({ events }) =>
    events.map(({ dep }) => dep),
  );
  return moments.reduce((busiest, moment) =>
    engine.activeAt(moment).length > engine.activeAt(busiest).length
      ? moment
      : busiest,
  );
};

test('only the hubs the published day knows are built', () => {
  const panel = new PulsPanel(
    RAIL_BUFFER,
    RAIL_STATIONS,
    recordingClock(),
    recordingLegend(),
  );
  assert.deepEqual(
    panel.hubs.map(({ name }) => name),
    ['Zürich HB'],
  );
});

test('every frame sets the station clock to the moment shown', () => {
  const clock = recordingClock();
  const panel = new PulsPanel(
    RAIL_BUFFER,
    RAIL_STATIONS,
    clock,
    recordingLegend(),
  );
  panel.update(3_600, 0);
  panel.update(3_630, 1 / 30);
  assert.deepEqual(clock.shown, [3_600, 3_630]);
});

test('the trains on show belong to a class and are ordered by draw rank', () => {
  const panel = new PulsPanel(
    RAIL_BUFFER,
    RAIL_STATIONS,
    recordingClock(),
    recordingLegend(),
  );
  panel.update(busiestMoment(), 0);
  assert.ok(panel.trains.length > 0);
  panel.trains.forEach((train) => {
    assert.equal(train.trainClass, trainClassOf(train.category));
    assert.notEqual(train.trainClass, null);
  });
  const ranks = panel.trains.map(({ trainClass }) => drawRank(trainClass));
  assert.deepEqual(
    ranks,
    [...ranks].sort((first, second) => first - second),
  );
});

test('a train is described by its category and the ends of its trip', () => {
  const panel = new PulsPanel(
    RAIL_BUFFER,
    RAIL_STATIONS,
    recordingClock(),
    recordingLegend(),
  );
  panel.update(busiestMoment(), 0);
  const [train] = panel.trains;
  const description = panel.describeVehicle(train);
  assert.equal(description.category, train.category);
  assert.ok(RAIL_STATIONS.some(({ name }) => name === description.origin));
  assert.ok(RAIL_STATIONS.some(({ name }) => name === description.destination));
});

test('the hubs stand in one steady colour until the phases are switched on', () => {
  const panel = new PulsPanel(
    RAIL_BUFFER,
    RAIL_STATIONS,
    recordingClock(),
    recordingLegend(),
  );
  const moment = busiestMoment();
  const beforeKey = hubColorsDrawnBy(drawnAt(panel, moment));
  assert.ok(beforeKey.length > 0);
  beforeKey.forEach(([red, green, blue]) => {
    assert.deepEqual([red, green, blue], HUB_STEADY_COLOR);
  });
  pressPhaseColorKey(panel);
  hubColorsDrawnBy(drawnAt(panel, moment)).forEach(([red, green, blue]) => {
    assert.notDeepEqual([red, green, blue], HUB_STEADY_COLOR);
  });
});

test('the trains keep their class colour until the phases are switched on', () => {
  const panel = new PulsPanel(
    RAIL_BUFFER,
    RAIL_STATIONS,
    recordingClock(),
    recordingLegend(),
  );
  const moment = momentAwayFromTheQuarter(busiestMoment());
  const classColors = () =>
    panel.trains.map(({ trainClass }) => trainClassById(trainClass).discColor);
  assert.deepEqual(trainColorsDrawnBy(drawnAt(panel, moment)), classColors());
  pressPhaseColorKey(panel);
  const phaseColors = trainColorsDrawnBy(drawnAt(panel, moment));
  assert.equal(phaseColors.length, panel.trains.length);
  phaseColors.forEach((color, index) => {
    assert.notDeepEqual(color, classColors()[index]);
  });
});

test('the key tells the legend which scheme is on show', () => {
  const legend = recordingLegend();
  const panel = new PulsPanel(
    RAIL_BUFFER,
    RAIL_STATIONS,
    recordingClock(),
    legend,
  );
  assert.equal(panel.phaseColorsInUse, false);
  pressPhaseColorKey(panel);
  pressPhaseColorKey(panel);
  assert.deepEqual(legend.schemes, [true, false]);
});
