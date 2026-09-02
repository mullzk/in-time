import assert from 'node:assert/strict';
import { test } from 'node:test';
import { VIEWS, viewAt } from './views.js';

test('a path names the view it belongs to', () => {
  assert.equal(viewAt('/zeitkarte').label, 'Zeitkarte');
  assert.equal(viewAt('/taktfahrplan').label, 'Taktfahrplan');
});

test('a trailing slash names the same view', () => {
  assert.equal(viewAt('/taktfahrplan/'), viewAt('/taktfahrplan'));
});

test('a station in the path names the same view', () => {
  assert.equal(viewAt('/taktfahrplan/bern'), viewAt('/taktfahrplan'));
  assert.equal(
    viewAt('/reisefaecher/bern-b%C3%BCmpliz-nord').label,
    'Reisefächer',
  );
});

test('a path outside the gallery has no view', () => {
  assert.equal(viewAt('/'), null);
  assert.equal(viewAt('/api/config'), null);
});

test('every view has its own path and its own label', () => {
  assert.equal(new Set(VIEWS.map((view) => view.path)).size, VIEWS.length);
  assert.equal(new Set(VIEWS.map((view) => view.label)).size, VIEWS.length);
});

test('every view path is absolute, so a link never depends on where it hangs', () => {
  VIEWS.forEach((view) => {
    assert.ok(view.path.startsWith('/'), view.path);
  });
});
