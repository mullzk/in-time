import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ReachedPlaces } from './reachedPlaces.js';

const place = (category, arrivalTime, name = `${category}@${arrivalTime}`) => ({
  entry: { name },
  east: arrivalTime,
  north: category,
  arrivalTime,
  category,
});

const FLASH = 100;

const runsOf = (places, seconds) => places.runsAt(seconds, FLASH);

test('the places are grouped by the traffic that reaches them', () => {
  const places = new ReachedPlaces([
    place(6, 10),
    place(0, 20),
    place(6, 30),
    place(2, 40),
  ]);

  assert.deepEqual(
    runsOf(places, 40).map((run) => [run.category, run.arrivals.length]),
    [
      [6, 2],
      [2, 1],
      [0, 1],
    ],
    'buses first, long-distance last, so the trains end up on top',
  );
});

test('inside a group the places are in the order one arrives', () => {
  const places = new ReachedPlaces([place(6, 30), place(6, 10), place(6, 20)]);

  assert.deepEqual([...runsOf(places, 30)[0].arrivals], [10, 20, 30]);
});

test('what is lit at a moment is what has been arrived at', () => {
  const places = new ReachedPlaces([place(6, 10), place(0, 20), place(6, 30)]);

  assert.equal(places.reachedAt(5).length, 0);
  assert.equal(places.reachedAt(20).length, 2);
  assert.equal(places.reachedAt(30).length, 3);
});

test('a run splits into what has settled and what has just lit up', () => {
  const places = new ReachedPlaces([
    place(6, 10),
    place(6, 20),
    place(6, 300),
    place(6, 380),
  ]);

  const [run] = places.runsAt(400, FLASH);

  assert.equal(run.reachedUntil, 4, 'all four have been arrived at');
  assert.equal(
    run.settledUntil,
    3,
    'only the one arrived at within the last flash still burns',
  );
});

test('a place is settled the moment its flash has burnt down', () => {
  const places = new ReachedPlaces([place(6, 100)]);

  assert.equal(places.runsAt(199, FLASH)[0].settledUntil, 0, 'still flashing');
  assert.equal(places.runsAt(200, FLASH)[0].settledUntil, 1, 'burnt down');
});

test('the places reached are given in the order they are drawn', () => {
  const places = new ReachedPlaces([place(6, 10), place(0, 20), place(2, 15)]);

  assert.deepEqual(
    places.reachedAt(20).map((reached) => reached.category),
    [6, 2, 0],
  );
  assert.deepEqual(
    places.reachedAt(15).map((reached) => reached.category),
    [6, 2],
  );
});
