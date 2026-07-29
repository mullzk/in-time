import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sameSelectionTarget } from './mapSelection.js';

const station = (station) => ({ kind: 'station', station });
const vehicle = (engineIndex, tripIndex) => ({
  kind: 'vehicle',
  vehicle: { engineIndex, tripIndex },
});

test('two picks of the same station are the same target', () => {
  const node = { name: 'Bern' };
  assert.equal(sameSelectionTarget(station(node), station(node)), true);
});

test('two picks of different stations are not the same target', () => {
  assert.equal(
    sameSelectionTarget(station({ name: 'Bern' }), station({ name: 'Thun' })),
    false,
  );
});

test('a station and a vehicle are never the same target', () => {
  assert.equal(sameSelectionTarget(station({}), vehicle(0, 0)), false);
});

test('fresh vehicle picks of the same trip are the same target', () => {
  assert.equal(sameSelectionTarget(vehicle(1, 7), vehicle(1, 7)), true);
});

test('vehicle picks of different trips are not the same target', () => {
  assert.equal(sameSelectionTarget(vehicle(1, 7), vehicle(1, 8)), false);
  assert.equal(sameSelectionTarget(vehicle(1, 7), vehicle(2, 7)), false);
});
