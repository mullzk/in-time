import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { VehicleFleet } from './vehicleFleet.js';

const fixture = (name) => {
  const bytes = readFileSync(new URL(`../fixtures/${name}`, import.meta.url));
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  );
};

const RAIL_BUFFER = fixture('golden-rail-day.itsb');
const ROAD_BUFFER = fixture('golden-bus-day.itsb');

const RAIL_STATIONS = [
  { didok: 1, name: 'Bahnhof' },
  { didok: 2, name: 'Mittelstadt' },
  { didok: 3, name: 'Endstation' },
];
const ROAD_STATIONS = [
  { didok: 10, name: 'Bahnhof Bus' },
  { didok: 11, name: 'Dorfplatz' },
  { didok: 12, name: 'Schulhaus' },
];

const fleetOfBothBlobs = () => {
  const fleet = new VehicleFleet();
  fleet.add(RAIL_BUFFER, RAIL_STATIONS);
  fleet.add(ROAD_BUFFER, ROAD_STATIONS);
  return fleet;
};

// The moment both golden days have vehicles running in them.
const momentWithTrafficIn = (fleet) =>
  fleet
    .engines()
    .map((engine) => engine.trips[0].events[0].dep)
    .reduce((latest, departure) => Math.max(latest, departure));

test('adding a blob hands back its engine', () => {
  const fleet = new VehicleFleet();
  const engine = fleet.add(RAIL_BUFFER, RAIL_STATIONS);

  assert.equal(engine, fleet.engines()[0]);
  assert.ok(engine.trips.length > 0);
});

test('a vehicle carries the index of the network it runs in', () => {
  const fleet = fleetOfBothBlobs();
  const vehicles = fleet.activeAt(momentWithTrafficIn(fleet));

  assert.ok(vehicles.length > 0);
  vehicles.forEach(({ networkIndex, tripIndex }) => {
    assert.ok(networkIndex === 0 || networkIndex === 1);
    assert.ok(fleet.networks[networkIndex].trips[tripIndex] !== undefined);
  });
});

// A trip index means something only inside its own network, so a vehicle of the
// second blob must not be looked up in the first one's stations.
test('a vehicle is described from the stations of its own network', () => {
  const fleet = fleetOfBothBlobs();
  const [, roadNetwork] = fleet.networks;
  const vehicle = { networkIndex: 1, tripIndex: 0, category: 6 };
  const { originStation, destinationStation } =
    roadNetwork.engine.tripEndpoints(0);

  assert.deepEqual(fleet.describe(vehicle), {
    label: 'Bus',
    category: 6,
    origin: ROAD_STATIONS[originStation].name,
    destination: ROAD_STATIONS[destinationStation].name,
  });
});

test('a vehicle stands where its own engine puts it', () => {
  const fleet = fleetOfBothBlobs();
  const seconds = momentWithTrafficIn(fleet);
  const [vehicle] = fleet.activeAt(seconds);

  assert.deepEqual(
    fleet.positionOf(vehicle, seconds),
    fleet.networks[vehicle.networkIndex].engine.positionAt(
      vehicle.tripIndex,
      seconds,
    ),
  );
});

test('a trail reaches back over the asked-for samples', () => {
  const fleet = fleetOfBothBlobs();
  const seconds = momentWithTrafficIn(fleet);
  const [vehicle] = fleet.activeAt(seconds);

  assert.deepEqual(
    fleet.trailPositions(vehicle, seconds, 3, 10),
    fleet.networks[vehicle.networkIndex].engine.trailPositions(
      vehicle.tripIndex,
      seconds,
      3,
      10,
    ),
  );
});
