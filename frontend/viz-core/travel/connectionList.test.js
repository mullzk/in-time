import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { buildConnectionList } from './connectionList.js';
import { VehiclePositionEngine } from './vehiclePositionEngine.js';

const trip = (events, category = 0) => ({ category, events });

const stop = (station, arrival, departure = arrival) => ({
  station,
  arr: arrival,
  dep: departure,
});

const catalog = (...didoks) =>
  didoks.map((didok) => ({ didok, name: `S${didok}`, modes: ['rail'] }));

const clustered = (didok, cluster) => ({
  didok,
  name: `S${didok}`,
  modes: ['rail'],
  cluster,
});

const network = (trips, ...didoks) => ({ trips, stations: catalog(...didoks) });

const connectionsOf = (list) =>
  Array.from({ length: list.connectionCount }, (_, index) =>
    list.connectionAt(index),
  );

const blobBuffer = (name) => {
  const bytes = readFileSync(new URL(`../fixtures/${name}`, import.meta.url));
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  );
};

test('a trip with three stops becomes two connections', () => {
  const list = buildConnectionList([
    network(
      [trip([stop(0, 36_000), stop(1, 36_600, 36_660), stop(2, 37_260)])],
      100,
      101,
      102,
    ),
  ]);

  assert.equal(list.connectionCount, 2);
  const [first, second] = connectionsOf(list);
  assert.deepEqual(
    [first.departureTime, first.arrivalTime],
    [36_000, 36_600],
    'the first connection runs from the first departure to the second arrival',
  );
  assert.deepEqual(
    [second.departureTime, second.arrivalTime],
    [36_660, 37_260],
    'the second connection leaves after the dwell, not on arrival',
  );
  assert.equal(list.didokOf(first.departureStation), 100);
  assert.equal(list.didokOf(first.arrivalStation), 101);
  assert.equal(list.didokOf(second.arrivalStation), 102);
});

test('a trip with a single stop becomes no connection', () => {
  const list = buildConnectionList([network([trip([stop(0, 36_000)])], 100)]);

  assert.equal(list.connectionCount, 0);
});

test('connections come in departure order across trips and networks', () => {
  const list = buildConnectionList([
    network(
      [
        trip([stop(0, 40_000), stop(1, 40_600)]),
        trip([stop(1, 36_000), stop(0, 36_600)]),
      ],
      100,
      101,
    ),
    network([trip([stop(0, 38_000), stop(1, 38_600)])], 101, 102),
  ]);

  const departures = connectionsOf(list).map(
    (connection) => connection.departureTime,
  );
  assert.deepEqual(departures, [36_000, 38_000, 40_000]);
});

test('equal departure times keep every connection', () => {
  const list = buildConnectionList([
    network(
      [
        trip([stop(0, 36_000), stop(1, 36_600)]),
        trip([stop(0, 36_000), stop(2, 36_900)]),
        trip([stop(1, 36_000), stop(2, 37_200)]),
      ],
      100,
      101,
      102,
    ),
  ]);

  assert.equal(list.connectionCount, 3);
  assert.deepEqual(
    connectionsOf(list)
      .map((connection) => connection.arrivalTime)
      .sort(),
    [36_600, 36_900, 37_200],
  );
});

test('the same didok in two networks is one station', () => {
  const list = buildConnectionList([
    network([trip([stop(0, 36_000), stop(1, 36_600)])], 100, 101),
    network([trip([stop(0, 37_000), stop(1, 37_600)])], 101, 102),
  ]);

  assert.equal(list.stationCount, 3, 'didok 101 is shared, not counted twice');
  const [railConnection, roadConnection] = connectionsOf(list);
  assert.equal(
    railConnection.arrivalStation,
    roadConnection.departureStation,
    'arriving on rail at 101 and leaving on road from 101 is the same place',
  );
});

test('a station only one network knows keeps its own place', () => {
  const list = buildConnectionList([
    network([trip([stop(0, 36_000), stop(1, 36_600)])], 100, 101),
    network([trip([stop(0, 37_000), stop(1, 37_600)])], 200, 201),
  ]);

  assert.equal(list.stationCount, 4);
  assert.deepEqual(
    [100, 101, 200, 201].map((didok) => list.didokOf(list.stationOf(didok))),
    [100, 101, 200, 201],
  );
});

test('a connection names the trip and the event it came from', () => {
  const list = buildConnectionList([
    network(
      [trip([stop(0, 36_000), stop(1, 36_600), stop(2, 37_260)])],
      100,
      101,
      102,
    ),
    network([trip([stop(0, 38_000), stop(1, 38_600)])], 200, 201),
  ]);

  const [first, second, third] = connectionsOf(list);
  assert.equal(first.trip, second.trip, 'both legs belong to the same trip');
  assert.equal(first.event, 0, 'the event index is the departing stop');
  assert.equal(second.event, 1);
  assert.notEqual(
    third.trip,
    first.trip,
    'a trip in another network is another trip',
  );
  assert.equal(list.networkOfTrip(first.trip), 0);
  assert.equal(list.networkOfTrip(third.trip), 1);
  assert.equal(list.tripInNetwork(third.trip), 0);
});

test('the trip count spans all networks', () => {
  const list = buildConnectionList([
    network(
      [
        trip([stop(0, 36_000), stop(1, 36_600)]),
        trip([stop(1, 37_000), stop(0, 37_600)]),
      ],
      100,
      101,
    ),
    network([trip([stop(0, 38_000), stop(1, 38_600)])], 200, 201),
  ]);

  assert.equal(list.tripCount, 3);
});

test('a trip keeps the kind of vehicle that runs it', () => {
  const CATEGORY_BUS = 6;
  const list = buildConnectionList([
    network([trip([stop(0, 36_000), stop(1, 36_600)])], 100, 101),
    {
      trips: [trip([stop(0, 37_000), stop(1, 37_600)], CATEGORY_BUS)],
      stations: catalog(200, 201),
    },
  ]);

  const [rail, road] = connectionsOf(list);
  assert.equal(list.categoryOfTrip(rail.trip), 0);
  assert.equal(list.categoryOfTrip(road.trip), CATEGORY_BUS);
});

test('the stops of an interchange know each other', () => {
  const list = buildConnectionList([
    {
      trips: [trip([stop(0, 36_000), stop(1, 36_600)])],
      stations: [clustered(100, 100), clustered(101, 100), ...catalog(102)],
    },
  ]);

  assert.deepEqual(list.clusterSiblingsOf(list.stationOf(100)), [
    list.stationOf(101),
  ]);
  assert.deepEqual(
    list.clusterSiblingsOf(list.stationOf(102)),
    [],
    'a stop that stands alone has no siblings',
  );
});

test('an interchange survives a network that does not name it', () => {
  const list = buildConnectionList([
    {
      trips: [trip([stop(0, 36_000), stop(1, 36_600)])],
      stations: catalog(100, 101),
    },
    {
      trips: [trip([stop(0, 37_000), stop(1, 37_600)])],
      stations: [clustered(101, 101), clustered(102, 101)],
    },
  ]);

  assert.deepEqual(list.clusterSiblingsOf(list.stationOf(101)), [
    list.stationOf(102),
  ]);
});

test('the golden blobs become the connections they describe', () => {
  const rail = new VehiclePositionEngine(blobBuffer('golden-rail-day.itsb'));
  const road = new VehiclePositionEngine(blobBuffer('golden-bus-day.itsb'));

  const list = buildConnectionList([
    { trips: rail.trips, stations: catalog(100, 101, 102) },
    { trips: road.trips, stations: catalog(101, 200, 201) },
  ]);

  assert.equal(
    list.connectionCount,
    5,
    'three from the rail fixture, two from the bus fixture',
  );
  assert.equal(list.stationCount, 5, 'didok 101 is shared by both fixtures');
  assert.deepEqual(
    connectionsOf(list).map((connection) => connection.departureTime),
    [36_000, 36_000, 36_660, 36_660, 40_000],
  );
});
