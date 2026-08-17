import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildConnectionList } from './connectionList.js';
import { ConnectionScan, MINIMUM_TRANSFER_SECONDS } from './connectionScan.js';

const trip = (events) => ({ category: 0, events });

const stop = (station, arrival, departure = arrival) => ({
  station,
  arr: arrival,
  dep: departure,
});

// Station entries as the published catalog carries them: `cluster` names the
// interchange a stop belongs to, by its representative didok.
const station = (didok, cluster = null) => ({
  didok,
  name: `S${didok}`,
  modes: ['rail'],
  cluster,
});

const listOf = (trips, stations) => buildConnectionList([{ trips, stations }]);

const scanOf = (list) => new ConnectionScan(list);

const arrivalAtDidok = (list, tree, didok) =>
  tree.arrivalAt(list.stationOf(didok));

const departureTimesOfPath = (list, tree, didok) =>
  tree
    .pathTo(list.stationOf(didok))
    .map((connection) => list.connectionAt(connection).departureTime);

test('a station the trip serves is reached at its arrival time', () => {
  const list = listOf(
    [trip([stop(0, 36_000), stop(1, 36_600)])],
    [station(100), station(101)],
  );

  const tree = scanOf(list).from(list.stationOf(100), 36_000);

  assert.equal(arrivalAtDidok(list, tree, 101), 36_600);
  assert.equal(tree.isReached(list.stationOf(101)), true);
});

test('a station no trip leads to stays unreached', () => {
  const list = listOf(
    [trip([stop(0, 36_000), stop(1, 36_600)])],
    [station(100), station(101), station(102)],
  );

  const tree = scanOf(list).from(list.stationOf(100), 36_000);

  assert.equal(tree.isReached(list.stationOf(102)), false);
  assert.equal(arrivalAtDidok(list, tree, 102), null);
});

test('the start station is reached at the start time itself', () => {
  const list = listOf(
    [trip([stop(0, 36_000), stop(1, 36_600)])],
    [station(100), station(101)],
  );

  const tree = scanOf(list).from(list.stationOf(100), 35_000);

  assert.equal(arrivalAtDidok(list, tree, 100), 35_000);
  assert.deepEqual(tree.pathTo(list.stationOf(100)), []);
});

test('a connection leaving before the start time is not taken', () => {
  const list = listOf(
    [trip([stop(0, 36_000), stop(1, 36_600)])],
    [station(100), station(101)],
  );

  const tree = scanOf(list).from(list.stationOf(100), 36_001);

  assert.equal(tree.isReached(list.stationOf(101)), false);
});

test('boarding at the start station needs no transfer time', () => {
  const list = listOf(
    [trip([stop(0, 36_000), stop(1, 36_600)])],
    [station(100), station(101)],
  );

  const tree = scanOf(list).from(list.stationOf(100), 36_000);

  assert.equal(arrivalAtDidok(list, tree, 101), 36_600);
});

test('changing trips needs the minimum transfer time', () => {
  const tooTight = 36_600 + MINIMUM_TRANSFER_SECONDS - 1;
  const list = listOf(
    [
      trip([stop(0, 36_000), stop(1, 36_600)]),
      trip([stop(1, tooTight), stop(2, 38_000)]),
    ],
    [station(100), station(101), station(102)],
  );

  const tree = scanOf(list).from(list.stationOf(100), 36_000);

  assert.equal(tree.isReached(list.stationOf(102)), false);
});

test('a change with the transfer time to spare is taken', () => {
  const justEnough = 36_600 + MINIMUM_TRANSFER_SECONDS;
  const list = listOf(
    [
      trip([stop(0, 36_000), stop(1, 36_600)]),
      trip([stop(1, justEnough), stop(2, 38_000)]),
    ],
    [station(100), station(101), station(102)],
  );

  const tree = scanOf(list).from(list.stationOf(100), 36_000);

  assert.equal(arrivalAtDidok(list, tree, 102), 38_000);
});

test('staying on the same trip pays no transfer time', () => {
  const briefDwell = 36_600 + 30;
  const list = listOf(
    [trip([stop(0, 36_000), stop(1, 36_600, briefDwell), stop(2, 37_200)])],
    [station(100), station(101), station(102)],
  );

  const tree = scanOf(list).from(list.stationOf(100), 36_000);

  assert.equal(arrivalAtDidok(list, tree, 102), 37_200);
});

test('an interchange passes the arrival on to its other stops', () => {
  const list = listOf(
    [
      trip([stop(0, 36_000), stop(1, 36_600)]),
      trip([stop(2, 36_600 + MINIMUM_TRANSFER_SECONDS), stop(3, 38_000)]),
    ],
    [station(100), station(101, 101), station(102, 101), station(103)],
  );

  const tree = scanOf(list).from(list.stationOf(100), 36_000);

  assert.equal(
    arrivalAtDidok(list, tree, 102),
    36_600,
    'the other stop of the interchange is reached when the train arrives',
  );
  assert.equal(arrivalAtDidok(list, tree, 103), 38_000);
});

test('stops outside an interchange pass nothing on', () => {
  const list = listOf(
    [
      trip([stop(0, 36_000), stop(1, 36_600)]),
      trip([stop(2, 36_600 + MINIMUM_TRANSFER_SECONDS), stop(3, 38_000)]),
    ],
    [station(100), station(101), station(102), station(103)],
  );

  const tree = scanOf(list).from(list.stationOf(100), 36_000);

  assert.equal(tree.isReached(list.stationOf(103)), false);
});

test('the path leads back to the start, in the order it is travelled', () => {
  const list = listOf(
    [
      trip([stop(0, 36_000), stop(1, 36_600)]),
      trip([stop(1, 37_000), stop(2, 38_000)]),
    ],
    [station(100), station(101), station(102)],
  );

  const tree = scanOf(list).from(list.stationOf(100), 36_000);

  assert.deepEqual(departureTimesOfPath(list, tree, 102), [36_000, 37_000]);
});

test('an unreached station has no path', () => {
  const list = listOf(
    [trip([stop(0, 36_000), stop(1, 36_600)])],
    [station(100), station(101), station(102)],
  );

  const tree = scanOf(list).from(list.stationOf(100), 36_000);

  assert.deepEqual(tree.pathTo(list.stationOf(102)), []);
});

test('the earlier arrival wins, and the path follows it', () => {
  const list = listOf(
    [
      trip([stop(0, 36_000), stop(1, 39_000)]),
      trip([stop(0, 36_300), stop(1, 37_500)]),
    ],
    [station(100), station(101)],
  );

  const tree = scanOf(list).from(list.stationOf(100), 36_000);

  assert.equal(arrivalAtDidok(list, tree, 101), 37_500);
  assert.deepEqual(departureTimesOfPath(list, tree, 101), [36_300]);
});

test('the same scan twice gives the same tree', () => {
  const list = listOf(
    [
      trip([stop(0, 36_000), stop(1, 36_600)]),
      trip([stop(1, 37_000), stop(2, 38_000)]),
      trip([stop(0, 36_100), stop(2, 39_000)]),
    ],
    [station(100), station(101), station(102)],
  );

  const scan = scanOf(list);
  const first = scan.from(list.stationOf(100), 36_000);
  const second = scan.from(list.stationOf(100), 36_000);

  assert.deepEqual(second.reachedStations(), first.reachedStations());
  assert.deepEqual(
    second.reachedStations().map((reached) => second.arrivalAt(reached)),
    first.reachedStations().map((reached) => first.arrivalAt(reached)),
  );
});

test('the tree names the connections it is made of', () => {
  const list = listOf(
    [
      trip([stop(0, 36_000), stop(1, 36_600)]),
      trip([stop(1, 37_000), stop(2, 38_000)]),
    ],
    [station(100), station(101), station(102)],
  );

  const tree = scanOf(list).from(list.stationOf(100), 36_000);

  assert.deepEqual(
    tree
      .connections()
      .map((connection) => list.connectionAt(connection).arrivalTime)
      .sort(),
    [36_600, 38_000],
  );
});
