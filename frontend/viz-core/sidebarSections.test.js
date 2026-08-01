import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sectionsToMount } from './sidebarSections.js';

const section = (id, keepInExhibition = false) => ({
  id,
  title: id,
  element: null,
  keepInExhibition,
});

const SECTIONS = [
  section('background', true),
  section('layers'),
  section('zoom', true),
  section('sound'),
];

const idsOf = (sections) => sections.map((mounted) => mounted.id);

test('every section is mounted in its given order outside the exhibition', () => {
  assert.deepEqual(idsOf(sectionsToMount(SECTIONS, { exhibition: false })), [
    'background',
    'layers',
    'zoom',
    'sound',
  ]);
});

test('the exhibition mounts only the sections flagged to survive it', () => {
  assert.deepEqual(idsOf(sectionsToMount(SECTIONS, { exhibition: true })), [
    'background',
    'zoom',
  ]);
});

test('a section without the flag is absent from the exhibition', () => {
  const mounted = sectionsToMount([section('sound')], { exhibition: true });
  assert.deepEqual(mounted, []);
});

test('sections are rejected when two of them share an id', () => {
  assert.throws(
    () => sectionsToMount([section('layers'), section('layers')], {}),
    /layers/,
  );
});
