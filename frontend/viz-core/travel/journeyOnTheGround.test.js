import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildConnectionList } from './connectionList.js';
import { ConnectionScan } from './connectionScan.js';
import { JourneyOnTheGround } from './journeyOnTheGround.js';

const trip = (events) => ({ category: 0, events });

const stop = (station, arrival, departure = arrival) => ({
  station,
  arr: arrival,
  dep: departure,
});

const station = (didok, cluster = null) => ({
  didok,
  name: `S${didok}`,
  modes: ['rail'],
  cluster,
});

// Stands in for a VehiclePositionEngine: a leg is named by the trip and the
// event it sets off from, which is all the journey passes on.
const namingEngine = (network) => ({
  legPolyline: (trip, event) => [`${network}/${trip}/${event}`],
});

const journeyTo = (networks, startDidok, startTime, didok) => {
  const connections = buildConnectionList(networks);
  const tree = new ConnectionScan(connections).from(
    connections.stationOf(startDidok),
    startTime,
  );
  const journeys = new JourneyOnTheGround(
    connections,
    networks.map((_, index) => namingEngine(index)),
  );
  const { legs, interchangeStations } = journeys.to(
    tree,
    connections.stationOf(didok),
  );
  return {
    legs,
    interchangeDidoks: interchangeStations.map((interchange) =>
      connections.didokOf(interchange),
    ),
  };
};

test('a journey draws the line of every leg it rides', () => {
  const journey = journeyTo(
    [
      {
        trips: [trip([stop(0, 36_000), stop(1, 36_600), stop(2, 37_200)])],
        stations: [station(100), station(101), station(102)],
      },
    ],
    100,
    36_000,
    102,
  );

  assert.deepEqual(journey.legs, [['0/0/0'], ['0/0/1']]);
  assert.deepEqual(journey.interchangeDidoks, []);
});

test('the stop a journey changes vehicles at is an interchange', () => {
  const journey = journeyTo(
    [
      {
        trips: [
          trip([stop(0, 36_000), stop(1, 36_600)]),
          trip([stop(1, 37_000), stop(2, 37_600)]),
        ],
        stations: [station(100), station(101), station(102)],
      },
    ],
    100,
    36_000,
    102,
  );

  assert.deepEqual(journey.legs, [['0/0/0'], ['0/1/0']]);
  assert.deepEqual(journey.interchangeDidoks, [101]);
});

// The two stops of one interchange are reached together, so the journey changes
// where the earlier leg pulls in, not where the later one sets off.
test('an interchange is named by the stop the journey arrives at', () => {
  const journey = journeyTo(
    [
      {
        trips: [
          trip([stop(0, 36_000), stop(1, 36_600)]),
          trip([stop(2, 37_000), stop(3, 37_600)]),
        ],
        stations: [
          station(100),
          station(101, 101),
          station(201, 101),
          station(202),
        ],
      },
    ],
    100,
    36_000,
    202,
  );

  assert.deepEqual(journey.interchangeDidoks, [101]);
});

test('the station one sets off from is reached without riding anything', () => {
  const journey = journeyTo(
    [
      {
        trips: [trip([stop(0, 36_000), stop(1, 36_600)])],
        stations: [station(100), station(101)],
      },
    ],
    100,
    36_000,
    100,
  );

  assert.deepEqual(journey.legs, []);
  assert.deepEqual(journey.interchangeDidoks, []);
});

test('a leg of another network is drawn by the engine of that network', () => {
  const journey = journeyTo(
    [
      {
        trips: [trip([stop(0, 36_000), stop(1, 36_600)])],
        stations: [station(100), station(101, 101)],
      },
      {
        trips: [trip([stop(0, 37_000), stop(1, 37_600)])],
        stations: [station(101, 101), station(102)],
      },
    ],
    100,
    36_000,
    102,
  );

  assert.deepEqual(journey.legs, [['0/0/0'], ['1/0/0']]);
});
