import assert from 'node:assert/strict';
import { test } from 'node:test';
import { tilesToHang } from './dockTiles.js';

const section = (id, keepInExhibition = false) => ({
  id,
  title: id,
  element: null,
  keepInExhibition,
});

const idsOf = (tiles) => tiles.map((tile) => tile.id);
const sectionIdsOf = (tiles) =>
  tiles.map((tile) => tile.sections.map((section) => section.id));

test('sections are grouped into the tiles that carry them', () => {
  const tiles = tilesToHang([
    section('sound'),
    section('zoom'),
    section('views'),
    section('background'),
  ]);
  assert.deepEqual(idsOf(tiles), ['views', 'map', 'sound']);
  assert.deepEqual(sectionIdsOf(tiles), [
    ['views'],
    ['background', 'zoom'],
    ['sound'],
  ]);
});

test('a tile whose sections nobody offers is not hung', () => {
  assert.deepEqual(idsOf(tilesToHang([section('layers')])), ['elements']);
});

test('a tile keeps its own order, whatever order it was handed', () => {
  const tiles = tilesToHang([section('clock'), section('tempo')]);
  assert.deepEqual(sectionIdsOf(tiles), [['tempo', 'clock']]);
});

test('the exhibition hangs only what survives it', () => {
  const tiles = tilesToHang(
    [section('views'), section('zoom', true), section('info', true)],
    { exhibition: true },
  );
  assert.deepEqual(idsOf(tiles), ['map', 'info']);
});

test('the info text is a tile like any other', () => {
  const tiles = tilesToHang([section('info'), section('layers')]);
  assert.deepEqual(idsOf(tiles), ['elements', 'info']);
});

test('sections are rejected when two of them share an id', () => {
  assert.throws(() => tilesToHang([section('zoom'), section('zoom')]), /zoom/);
});

test('a section no tile carries is rejected', () => {
  assert.throws(() => tilesToHang([section('weather')]), /weather/);
});
