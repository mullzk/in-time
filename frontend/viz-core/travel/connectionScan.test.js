import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildConnectionList } from './connectionList.js';
import {
  ConnectionScan,
  MAXIMUM_WAIT_SECONDS,
  MINIMUM_TRANSFER_SECONDS,
} from './connectionScan.js';

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

test('the interchange one starts at is where one starts', () => {
  const list = listOf(
    [trip([stop(1, 36_000 + MINIMUM_TRANSFER_SECONDS), stop(2, 38_000)])],
    [station(100, 100), station(101, 100), station(102)],
  );

  const tree = scanOf(list).from(list.stationOf(100), 36_000);

  assert.equal(
    arrivalAtDidok(list, tree, 101),
    36_000,
    'the other stops of the interchange are reached at the start time',
  );
  assert.equal(
    arrivalAtDidok(list, tree, 102),
    38_000,
    'and a departure from one of them can be boarded',
  );
});

test('leaving from the other side of the interchange takes the transfer time', () => {
  const tooTight = 36_000 + MINIMUM_TRANSFER_SECONDS - 1;
  const list = listOf(
    [trip([stop(1, tooTight), stop(2, 38_000)])],
    [station(100, 100), station(101, 100), station(102)],
  );

  const tree = scanOf(list).from(list.stationOf(100), 36_000);

  assert.equal(tree.isReached(list.stationOf(102)), false);
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

test('nobody waits longer than the maximum wait for a change', () => {
  const tooLate = 36_600 + MAXIMUM_WAIT_SECONDS + 1;
  const list = listOf(
    [
      trip([stop(0, 36_000), stop(1, 36_600)]),
      trip([stop(1, tooLate), stop(2, tooLate + 600)]),
    ],
    [station(100), station(101), station(102)],
  );

  const tree = scanOf(list).from(list.stationOf(100), 36_000);

  assert.equal(tree.isReached(list.stationOf(102)), false);
});

test('a change just inside the maximum wait is still taken', () => {
  const justInTime = 36_600 + MAXIMUM_WAIT_SECONDS;
  const list = listOf(
    [
      trip([stop(0, 36_000), stop(1, 36_600)]),
      trip([stop(1, justInTime), stop(2, justInTime + 600)]),
    ],
    [station(100), station(101), station(102)],
  );

  const tree = scanOf(list).from(list.stationOf(100), 36_000);

  assert.equal(arrivalAtDidok(list, tree, 102), justInTime + 600);
});

test('what lay behind too long a wait falls away with it', () => {
  const tooLate = 36_600 + MAXIMUM_WAIT_SECONDS + 1;
  const list = listOf(
    [
      trip([stop(0, 36_000), stop(1, 36_600)]),
      trip([stop(1, tooLate), stop(2, tooLate + 600)]),
      trip([stop(2, tooLate + 1_200), stop(3, tooLate + 1_800)]),
    ],
    [station(100), station(101), station(102), station(103)],
  );

  const tree = scanOf(list).from(list.stationOf(100), 36_000);

  assert.deepEqual(
    tree.reachedStations(),
    [list.stationOf(100), list.stationOf(101)],
    'only what is reached without the long wait remains',
  );
});

test('a long stop in the vehicle one sits in is no wait at all', () => {
  const longDwell = 36_600 + MAXIMUM_WAIT_SECONDS + 3_600;
  const list = listOf(
    [
      trip([
        stop(0, 36_000),
        stop(1, 36_600, longDwell),
        stop(2, longDwell + 600),
      ]),
    ],
    [station(100), station(101), station(102)],
  );

  const tree = scanOf(list).from(list.stationOf(100), 36_000);

  assert.equal(arrivalAtDidok(list, tree, 102), longDwell + 600);
});

test('the wait at the start counts from the start time', () => {
  const list = listOf(
    [trip([stop(0, 36_000 + MAXIMUM_WAIT_SECONDS + 1), stop(1, 50_000)])],
    [station(100), station(101)],
  );

  const tree = scanOf(list).from(list.stationOf(100), 36_000);

  assert.equal(tree.isReached(list.stationOf(101)), false);
});

test('the maximum wait can be set to another patience', () => {
  const departure = 36_600 + 3_600;
  const list = listOf(
    [
      trip([stop(0, 36_000), stop(1, 36_600)]),
      trip([stop(1, departure), stop(2, departure + 600)]),
    ],
    [station(100), station(101), station(102)],
  );

  const impatient = new ConnectionScan(list, {
    maximumWaitSeconds: 1_800,
  }).from(list.stationOf(100), 36_000);
  const patient = new ConnectionScan(list, { maximumWaitSeconds: 7_200 }).from(
    list.stationOf(100),
    36_000,
  );

  assert.equal(impatient.isReached(list.stationOf(102)), false);
  assert.equal(patient.isReached(list.stationOf(102)), true);
});

// One boards a bus early on its run and stays seated. Further along it passes a
// stop one could have been at hours ago by another route -- which is no wait,
// because one is sitting in the bus. The leg must be told from where one boarded.
const ridingThroughAStopReachedEarlier = () =>
  listOf(
    [
      trip([stop(0, 36_000), stop(1, 36_600)]),
      trip([stop(0, 36_000), stop(2, 37_200)]),
      trip([
        stop(2, 37_800),
        stop(1, 46_800, 47_100),
        stop(3, 47_400, 47_520),
        stop(4, 48_000),
      ]),
    ],
    [station(100), station(101), station(102), station(103), station(104)],
  );

test('a leg is told from the stop before it, whoever reached that stop', () => {
  const list = ridingThroughAStopReachedEarlier();

  const tree = scanOf(list).from(list.stationOf(100), 36_000);
  const leg = tree.legInto(list.stationOf(103));

  assert.equal(
    leg.fromStation,
    list.stationOf(101),
    'the vehicle came from there, however one reached that stop oneself',
  );
  assert.equal(leg.departureTime, 47_100);
  assert.equal(leg.arrivalTime, 47_400);
});

test('the wait is what one stands at the stop the leg sets off from', () => {
  const list = ridingThroughAStopReachedEarlier();

  const tree = scanOf(list).from(list.stationOf(100), 36_000);

  assert.equal(
    tree.waitBeforeLegInto(list.stationOf(103)),
    47_100 - tree.arrivalAt(list.stationOf(101)),
    'one is at that stop already and waits there for the vehicle',
  );
});

test('riding through a stop is no wait', () => {
  const list = listOf(
    [trip([stop(0, 36_000), stop(1, 36_600, 40_000), stop(2, 40_600)])],
    [station(100), station(101), station(102)],
  );

  const tree = scanOf(list).from(list.stationOf(100), 36_000);

  assert.equal(
    tree.waitBeforeLegInto(list.stationOf(102)),
    0,
    'the vehicle standing there is no wait for whoever sits in it',
  );
});

test('the wait before the first departure is counted from the start', () => {
  const list = listOf(
    [trip([stop(0, 36_600), stop(1, 37_200)])],
    [station(100), station(101)],
  );

  const tree = scanOf(list).from(list.stationOf(100), 36_000);

  assert.equal(tree.waitBeforeLegInto(list.stationOf(101)), 600);
});

test('a path back through the start interchange ends there', () => {
  const list = listOf(
    [trip([stop(1, 36_600), stop(2, 37_200)])],
    [station(100, 100), station(101, 100), station(102)],
  );

  const tree = scanOf(list).from(list.stationOf(100), 36_000);
  const path = tree
    .pathTo(list.stationOf(102))
    .map((connection) => list.connectionAt(connection));

  assert.equal(path.length, 1, 'the one ride, and no leg back across the road');
  assert.equal(
    path[0].departureStation,
    list.stationOf(101),
    'the bus stop of the start interchange one boarded at',
  );
});

test('the path is a chain without holes, stop by stop', () => {
  const list = ridingThroughAStopReachedEarlier();

  const tree = scanOf(list).from(list.stationOf(100), 36_000);
  const path = tree
    .pathTo(list.stationOf(104))
    .map((connection) => list.connectionAt(connection));

  path.slice(1).forEach((connection, index) => {
    assert.equal(
      connection.departureStation,
      path[index].arrivalStation,
      'every leg sets off where the one before it arrived',
    );
  });
  assert.equal(path[0].departureStation, list.stationOf(100), 'from the start');
});

test('a leg that carries on from the stop before says so', () => {
  const list = ridingThroughAStopReachedEarlier();

  const tree = scanOf(list).from(list.stationOf(100), 36_000);
  const leg = tree.legInto(list.stationOf(104));

  assert.equal(
    leg.fromStation,
    list.stationOf(103),
    'the stop before was reached on this very trip, so it is where this leg starts',
  );
  assert.equal(leg.departureTime, 47_520);
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

test('a ride runs from where one boards to the last stop one is carried to', () => {
  const list = listOf(
    [trip([stop(0, 36_000), stop(1, 36_600), stop(2, 37_200)])],
    [station(100), station(101), station(102)],
  );

  const tree = scanOf(list).from(list.stationOf(100), 36_000);

  assert.deepEqual(
    tree
      .rides()
      .map(({ departureTime, arrivalTime }) => [departureTime, arrivalTime]),
    [[36_000, 37_200]],
    'one vehicle, ridden in one go',
  );
});

test('a ride one joins later starts where one got in', () => {
  const list = listOf(
    [
      trip([stop(0, 36_000), stop(1, 36_600)]),
      trip([stop(3, 30_000), stop(1, 37_000), stop(2, 38_000)]),
    ],
    [station(100), station(101), station(102), station(103)],
  );

  const tree = scanOf(list).from(list.stationOf(100), 36_000);

  const joined = tree.rides().find((ride) => ride.arrivalTime === 38_000);
  assert.equal(
    joined.departureTime,
    37_000,
    'the vehicle is drawn from the stop one boards it at, not from its origin',
  );
});

test('the tree knows when its last vehicle arrives', () => {
  const list = listOf(
    [
      trip([stop(0, 36_000), stop(1, 36_600)]),
      trip([stop(1, 37_000), stop(2, 38_500)]),
    ],
    [station(100), station(101), station(102)],
  );

  const tree = scanOf(list).from(list.stationOf(100), 36_000);

  assert.equal(tree.latestArrival(), 38_500);
});

test('a tree that reaches nowhere ends at the moment it starts', () => {
  const list = listOf(
    [trip([stop(0, 36_000), stop(1, 36_600)])],
    [station(100), station(101)],
  );

  const tree = scanOf(list).from(list.stationOf(100), 40_000);

  assert.equal(tree.latestArrival(), 40_000);
  assert.deepEqual(tree.rides(), []);
});
