import assert from 'node:assert/strict';
import { test } from 'node:test';
import { stationToTravelFrom } from './startStation.js';

const travelsFromAll = () => true;

test('the station is drawn from the whole list', () => {
  const candidates = ['a', 'b', 'c', 'd'];

  assert.equal(
    stationToTravelFrom(candidates, travelsFromAll, () => 0),
    'a',
  );
  assert.equal(
    stationToTravelFrom(candidates, travelsFromAll, () => 0.99),
    'd',
  );
});

test('a station one travels nowhere from is passed over', () => {
  const candidates = ['dead end', 'another dead end', 'a station with trains'];

  assert.equal(
    stationToTravelFrom(
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
    stationToTravelFrom(
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
    stationToTravelFrom(
      candidates,
      () => false,
      () => 0.5,
    ),
    'b',
  );
});

test('an empty list yields no station at all', () => {
  assert.equal(stationToTravelFrom([], travelsFromAll), null);
});
