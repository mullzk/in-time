import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  StationInUrl,
  stationMatchingSlug,
  stationSlug,
} from './stationInUrl.js';

const addressBar = (pathname, search = '') => {
  const history = { written: [] };
  const location = { pathname, search };
  history.replaceState = (_state, _title, url) => {
    history.written.push(url);
    const [path, query = ''] = url.split('?');
    location.pathname = path;
    location.search = query === '' ? '' : `?${query}`;
  };
  return { location, history };
};

const stationInUrlAt = (pathname, search = '') => {
  const { location, history } = addressBar(pathname, search);
  return new StationInUrl(location, history);
};

test('a name becomes a slug one can read in the address bar', () => {
  assert.equal(stationSlug('Bern'), 'bern');
  assert.equal(stationSlug('Zürich HB'), 'zürich-hb');
  assert.equal(stationSlug('St. Gallen'), 'st-gallen');
  assert.equal(stationSlug('Bern, Bümpliz Nord'), 'bern-bümpliz-nord');
  assert.equal(stationSlug('Biel/Bienne'), 'biel-bienne');
  assert.equal(stationSlug('Sion, Gare (Bus)'), 'sion-gare-bus');
});

test('the path separator never survives into a slug', () => {
  assert.ok(!stationSlug('Biel/Bienne').includes('/'));
  assert.ok(!stationSlug('La Chaux-de-Fonds/Le Locle').includes('/'));
});

test('a station is found by its own slug', () => {
  const entries = [{ name: 'Bern' }, { name: 'Zürich HB' }];

  assert.equal(stationMatchingSlug(entries, 'zürich-hb'), entries[1]);
});

test('a slug typed without its umlauts still finds the station', () => {
  const entries = [{ name: 'Zürich HB' }];

  assert.equal(stationMatchingSlug(entries, 'zurich-hb'), entries[0]);
});

test('a slug nobody is named after finds nothing', () => {
  assert.equal(stationMatchingSlug([{ name: 'Bern' }], 'atlantis'), null);
  assert.equal(stationMatchingSlug([{ name: 'Bern' }], ''), null);
});

test('the first station of that name wins, so a link always opens the same one', () => {
  const entries = [
    { name: 'Bern', didok: 8_507_000 },
    { name: 'Bern', didok: 8_590_000 },
  ];

  assert.equal(stationMatchingSlug(entries, 'bern'), entries[0]);
});

test('the station in the path is the one the view opens on', () => {
  assert.equal(stationInUrlAt('/taktfahrplan/bern').slug, 'bern');
  assert.equal(
    stationInUrlAt('/taktfahrplan/z%C3%BCrich-hb').slug,
    'zürich-hb',
  );
});

test('a view without a station in its path names none', () => {
  assert.equal(stationInUrlAt('/taktfahrplan').slug, null);
  assert.equal(stationInUrlAt('/taktfahrplan/').slug, null);
});

test('the address knows which view it belongs to', () => {
  assert.equal(stationInUrlAt('/zeitkarte/bern').view.label, 'Zeitkarte');
  assert.equal(stationInUrlAt('/api/config').view, null);
});

test('a chosen station is written into the address', () => {
  const stationInUrl = stationInUrlAt('/taktfahrplan');

  stationInUrl.show({ name: 'Bern, Bümpliz Nord' });

  assert.equal(stationInUrl.slug, 'bern-bümpliz-nord');
  assert.equal(
    stationInUrl.history.written.at(-1),
    '/taktfahrplan/bern-b%C3%BCmpliz-nord',
  );
});

test('choosing another station replaces the one in the address', () => {
  const stationInUrl = stationInUrlAt('/taktfahrplan/bern');

  stationInUrl.show({ name: 'Chur' });

  assert.equal(stationInUrl.history.written.at(-1), '/taktfahrplan/chur');
});

test('what else the address carries survives naming a station', () => {
  const stationInUrl = stationInUrlAt('/taktfahrplan', '?mode=exhibition');

  stationInUrl.show({ name: 'Bern' });

  assert.equal(
    stationInUrl.history.written.at(-1),
    '/taktfahrplan/bern?mode=exhibition',
  );
});

test('giving the station up leaves the view alone in the address', () => {
  const stationInUrl = stationInUrlAt('/taktfahrplan/bern');

  stationInUrl.forget();

  assert.equal(stationInUrl.slug, null);
  assert.equal(stationInUrl.history.written.at(-1), '/taktfahrplan');
});

test('what else the address carries survives giving the station up', () => {
  const stationInUrl = stationInUrlAt('/taktfahrplan/bern', '?mode=exhibition');

  stationInUrl.forget();

  assert.equal(
    stationInUrl.history.written.at(-1),
    '/taktfahrplan?mode=exhibition',
  );
});

test('a page outside the gallery is left alone', () => {
  const stationInUrl = stationInUrlAt('/health/');

  stationInUrl.show({ name: 'Bern' });

  assert.deepEqual(stationInUrl.history.written, []);
});

test('the other views are linked to with the same station', () => {
  const stationInUrl = stationInUrlAt('/taktfahrplan/bern');

  assert.equal(stationInUrl.linkTo('/zeitkarte'), '/zeitkarte/bern');
});

test('without a station the other views are linked to plainly', () => {
  const stationInUrl = stationInUrlAt('/taktfahrplan', '?mode=exhibition');

  assert.equal(stationInUrl.linkTo('/zeitkarte'), '/zeitkarte?mode=exhibition');
});

test('a link to another view carries the station chosen since the page loaded', () => {
  const stationInUrl = stationInUrlAt('/taktfahrplan');

  stationInUrl.show({ name: 'Zürich HB' });

  assert.equal(
    stationInUrl.linkTo('/reisefaecher'),
    '/reisefaecher/z%C3%BCrich-hb',
  );
});
