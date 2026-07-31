import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadSchedule } from './loader.js';

const CONFIG_URL = '/api/config';
const CONFIG = {
  railScheduleBlobUrl: '/artifacts/schedule-rail.itsb',
  roadScheduleBlobUrl: '/artifacts/schedule-road.itsb',
  railStationsUrl: '/api/stations/rail',
  roadStationsUrl: '/api/stations/road',
};

const RAIL_BUFFER = new ArrayBuffer(8);
const ROAD_BUFFER = new ArrayBuffer(16);
const RAIL_STATIONS = [{ didok: 1, name: 'Bern' }];
const ROAD_STATIONS = [{ didok: 2, name: 'Bern, Bahnhof' }];

const jsonResponse = (payload) => ({
  ok: true,
  status: 200,
  json: () => Promise.resolve(payload),
});
const blobResponse = (buffer) => ({
  ok: true,
  status: 200,
  arrayBuffer: () => Promise.resolve(buffer),
});

const deferred = () => {
  let release;
  const promise = new Promise((resolve) => {
    release = resolve;
  });
  return { promise, release };
};

// Lets every pending microtask settle, so the requests the loader issues in
// reaction to a resolved response are recorded before we assert on them.
const settleMicrotasks = () => new Promise((resolve) => setImmediate(resolve));

const withFakeFetch = async (fakeFetch, body) => {
  const original = globalThis.fetch;
  globalThis.fetch = fakeFetch;
  try {
    return await body();
  } finally {
    globalThis.fetch = original;
  }
};

const recordingFetch = (requested, urgentGate) => (url) => {
  requested.push(url);
  if (url === CONFIG_URL) {
    return Promise.resolve(jsonResponse(CONFIG));
  }
  if (url === CONFIG.roadScheduleBlobUrl) {
    return Promise.resolve(blobResponse(ROAD_BUFFER));
  }
  const urgent = {
    [CONFIG.railScheduleBlobUrl]: blobResponse(RAIL_BUFFER),
    [CONFIG.railStationsUrl]: jsonResponse(RAIL_STATIONS),
    [CONFIG.roadStationsUrl]: jsonResponse(ROAD_STATIONS),
  }[url];
  return urgentGate.promise.then(() => urgent);
};

test('the road blob is requested only once the urgent group has arrived', async () => {
  const requested = [];
  const urgentGate = deferred();

  await withFakeFetch(recordingFetch(requested, urgentGate), async () => {
    const loading = loadSchedule(CONFIG_URL);
    await settleMicrotasks();

    assert.deepEqual(requested, [
      CONFIG_URL,
      CONFIG.railScheduleBlobUrl,
      CONFIG.railStationsUrl,
      CONFIG.roadStationsUrl,
    ]);

    urgentGate.release();
    const result = await loading;

    assert.ok(requested.includes(CONFIG.roadScheduleBlobUrl));
    assert.equal(await result.roadBuffer, ROAD_BUFFER);
  });
});

test('the urgent results are complete when loadSchedule resolves', async () => {
  const urgentGate = deferred();
  urgentGate.release();

  await withFakeFetch(recordingFetch([], urgentGate), async () => {
    const result = await loadSchedule(CONFIG_URL);
    assert.equal(result.published, true);
    assert.equal(result.railBuffer, RAIL_BUFFER);
    assert.deepEqual(result.railStations, RAIL_STATIONS);
    assert.deepEqual(result.roadStations, ROAD_STATIONS);
    assert.ok(result.roadBuffer instanceof Promise);
  });
});

test('an unpublished day resolves without any blob request', async () => {
  const requested = [];
  await withFakeFetch(
    (url) => {
      requested.push(url);
      return Promise.resolve({ ok: false, status: 503 });
    },
    async () => {
      const result = await loadSchedule(CONFIG_URL);
      assert.deepEqual(result, { published: false });
      assert.deepEqual(requested, [CONFIG_URL]);
    },
  );
});
