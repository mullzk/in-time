import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { VehiclePositionEngine } from '../viz-core/travel/vehiclePositionEngine.js';
import { PulsPanel } from './panel.js';
import { drawRank, trainClassOf } from './trainClasses.js';

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
  const panel = new PulsPanel(RAIL_BUFFER, RAIL_STATIONS, recordingClock());
  assert.deepEqual(
    panel.hubs.map(({ name }) => name),
    ['Zürich HB'],
  );
});

test('every frame sets the station clock to the moment shown', () => {
  const clock = recordingClock();
  const panel = new PulsPanel(RAIL_BUFFER, RAIL_STATIONS, clock);
  panel.update(3_600, 0);
  panel.update(3_630, 1 / 30);
  assert.deepEqual(clock.shown, [3_600, 3_630]);
});

test('the trains on show belong to a class and are ordered by draw rank', () => {
  const panel = new PulsPanel(RAIL_BUFFER, RAIL_STATIONS, recordingClock());
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
  const panel = new PulsPanel(RAIL_BUFFER, RAIL_STATIONS, recordingClock());
  panel.update(busiestMoment(), 0);
  const [train] = panel.trains;
  const description = panel.describeVehicle(train);
  assert.equal(description.category, train.category);
  assert.ok(RAIL_STATIONS.some(({ name }) => name === description.origin));
  assert.ok(RAIL_STATIONS.some(({ name }) => name === description.destination));
});
