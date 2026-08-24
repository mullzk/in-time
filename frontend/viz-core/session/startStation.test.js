import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  drawnStationThatTravels,
  StartStationChoice,
  stationToTravelFrom,
} from './startStation.js';

const travelsFromAll = () => true;

const RAIL_STATION = { didok: 1, name: 'Bern' };
const BUS_STOP = { didok: 2, name: 'Hohenrain, Post' };

const railOnly = {
  catalog: { entries: [RAIL_STATION] },
  connections: { stationOf: (didok) => (didok === 1 ? 7 : undefined) },
};

const railAndRoad = {
  catalog: { entries: [RAIL_STATION, BUS_STOP] },
  connections: { stationOf: () => 7 },
};

const scan = { from: () => ({ connections: () => [0] }) };

const settleOn = (choice, schedule) =>
  choice.settleOn(schedule.catalog, schedule.connections, scan, 7 * 3600);

test('the station is drawn from the whole list', () => {
  const candidates = ['a', 'b', 'c', 'd'];

  assert.equal(
    drawnStationThatTravels(candidates, travelsFromAll, () => 0),
    'a',
  );
  assert.equal(
    drawnStationThatTravels(candidates, travelsFromAll, () => 0.99),
    'd',
  );
});

test('a station one travels nowhere from is passed over', () => {
  const candidates = ['dead end', 'another dead end', 'a station with trains'];

  assert.equal(
    drawnStationThatTravels(
      candidates,
      (candidate) => candidate === 'a station with trains',
      () => 0,
    ),
    'a station with trains',
  );
});

test('the walk wraps around the end of the list', () => {
  const candidates = ['a station with trains', 'dead end'];

  assert.equal(
    drawnStationThatTravels(
      candidates,
      (candidate) => candidate === 'a station with trains',
      () => 0.9,
    ),
    'a station with trains',
  );
});

test('where nothing travels the first one drawn is taken', () => {
  const candidates = ['a', 'b', 'c'];

  assert.equal(
    drawnStationThatTravels(
      candidates,
      () => false,
      () => 0.5,
    ),
    'b',
  );
});

test('an empty list yields no station at all', () => {
  assert.equal(drawnStationThatTravels([], travelsFromAll), null);
});

test('only a station the timetable knows is set off from', () => {
  const catalog = {
    entries: [
      { didok: 1, name: 'nur im Katalog' },
      { didok: 2, name: 'im Fahrplan' },
    ],
  };
  const connections = {
    stationOf: (didok) => (didok === 2 ? 7 : undefined),
  };
  const scan = { from: () => ({ connections: () => [0] }) };

  assert.equal(
    stationToTravelFrom(catalog, connections, scan, 7 * 3600).didok,
    2,
  );
});

test('the station the address names is set off from, not a drawn one', () => {
  const choice = new StartStationChoice('bern');

  assert.equal(settleOn(choice, railOnly), RAIL_STATION);
  assert.equal(choice.drawnByThePanel, false);
});

test('a name only a later schedule knows is waited for', () => {
  const choice = new StartStationChoice('hohenrain-post');

  assert.equal(
    settleOn(choice, railOnly),
    null,
    'rather than showing a station nobody asked for',
  );
  assert.equal(settleOn(choice, railAndRoad), BUS_STOP);
});

test('a name no schedule knows gives way once none is left to come', () => {
  const choice = new StartStationChoice('gibt-es-nicht');

  assert.equal(settleOn(choice, railAndRoad), null);

  choice.noFurtherScheduleIsComing();

  assert.notEqual(settleOn(choice, railAndRoad), null, 'a drawn station now');
  assert.equal(choice.drawnByThePanel, true);
});

test('an address naming nothing is answered by a drawn station at once', () => {
  const choice = new StartStationChoice();

  assert.equal(settleOn(choice, railOnly), RAIL_STATION);
  assert.equal(choice.drawnByThePanel, true);
});

test('a view that draws nothing of its own rests at no station', () => {
  const choice = new StartStationChoice(null, { drawsOnItsOwn: false });

  assert.equal(settleOn(choice, railOnly), null);

  choice.noFurtherScheduleIsComing();

  assert.equal(
    settleOn(choice, railAndRoad),
    null,
    'nothing is drawn once the schedules are all in either',
  );
});

test('a view that draws nothing still sets off from the name it was given', () => {
  const choice = new StartStationChoice('bern', { drawsOnItsOwn: false });

  assert.equal(settleOn(choice, railOnly), RAIL_STATION);
});

test('a station chosen on the picture survives the next schedule', () => {
  const choice = new StartStationChoice();
  settleOn(choice, railOnly);

  choice.choose(BUS_STOP);

  assert.equal(settleOn(choice, railAndRoad), BUS_STOP);
});

test('a drawn station is not exchanged for another one later', () => {
  const choice = new StartStationChoice();
  const drawn = settleOn(choice, railOnly);

  assert.equal(settleOn(choice, railAndRoad), drawn);
});
