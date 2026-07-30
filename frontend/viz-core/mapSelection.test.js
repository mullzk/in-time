import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MapSelection, sameSelectionTarget } from './mapSelection.js';

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

function makeFakePopover() {
  return {
    calls: [],
    showAt(x, y) {
      this.calls.push(['showAt', x, y]);
    },
    showLines(x, y) {
      this.calls.push(['showLines', x, y]);
    },
    moveTo(x, y) {
      this.calls.push(['moveTo', x, y]);
    },
    hide() {
      this.calls.push(['hide']);
    },
  };
}

// Records the handlers MapSelection binds so a test can fire pointer events at
// it, and returns a fixed origin so client coordinates map straight to local.
function makeFakeCanvas() {
  const handlers = {};
  return {
    handlers,
    addEventListener(type, handler) {
      handlers[type] = handler;
    },
    getBoundingClientRect() {
      return { left: 0, top: 0 };
    },
  };
}

// A camera whose horizontal pan the test can shift to mimic any view change,
// so worldToScreen returns a different screen point after a camera move.
function makeSelection({ popover, hoverPopover, panel } = {}) {
  const camera = {
    pan: 0,
    worldToScreen(east, north) {
      return [east + this.pan, north];
    },
  };
  const context = { camera, time: { current: 0 }, focusStation() {} };
  const selection = new MapSelection(null, panel ?? {}, context, {
    popover: popover ?? makeFakePopover(),
    hoverPopover: hoverPopover ?? makeFakePopover(),
  });
  return { selection, camera };
}

test('a selected station popover re-anchors to the camera each frame', () => {
  const popover = makeFakePopover();
  const { selection, camera } = makeSelection({ popover });
  selection.selectStation({ east: 100, north: 200, name: 'Bern' });
  assert.deepEqual(popover.calls.at(-1), ['showAt', 100, 200]);

  camera.pan = 50;
  selection.onFrameRendered();
  assert.deepEqual(popover.calls.at(-1), ['moveTo', 150, 200]);
});

test('a cleared selection stops re-anchoring on later frames', () => {
  const popover = makeFakePopover();
  const { selection, camera } = makeSelection({ popover });
  selection.selectStation({ east: 100, north: 200, name: 'Bern' });
  selection.clear();
  const callsAfterClear = popover.calls.length;

  camera.pan = 50;
  selection.onFrameRendered();
  assert.equal(popover.calls.length, callsAfterClear);
});

const mouseMove = (clientX, clientY) => ({
  pointerType: 'mouse',
  buttons: 0,
  clientX,
  clientY,
});

test('hovering a station shows a popover that re-anchors each frame', () => {
  const hoverPopover = makeFakePopover();
  const bern = { east: 100, north: 200, name: 'Bern' };
  const { selection, camera } = makeSelection({
    hoverPopover,
    panel: { stationAt: () => bern },
  });
  const canvas = makeFakeCanvas();
  selection.attachTo(canvas);

  canvas.handlers.pointermove(mouseMove(5, 5));
  assert.deepEqual(hoverPopover.calls.at(-1), ['showAt', 100, 200]);

  camera.pan = 50;
  selection.onFrameRendered();
  assert.deepEqual(hoverPopover.calls.at(-1), ['moveTo', 150, 200]);
});

test('leaving a hovered station hides its popover', () => {
  const hoverPopover = makeFakePopover();
  const bern = { east: 100, north: 200, name: 'Bern' };
  const { selection } = makeSelection({
    hoverPopover,
    panel: { stationAt: () => bern },
  });
  const canvas = makeFakeCanvas();
  selection.attachTo(canvas);

  canvas.handlers.pointermove(mouseMove(5, 5));
  canvas.handlers.pointerleave();
  assert.deepEqual(hoverPopover.calls.at(-1), ['hide']);
});

test('hovering the already-selected station shows no hover popover', () => {
  const hoverPopover = makeFakePopover();
  const bern = { east: 100, north: 200, name: 'Bern' };
  const { selection } = makeSelection({
    hoverPopover,
    panel: { stationAt: () => bern },
  });
  const canvas = makeFakeCanvas();
  selection.attachTo(canvas);

  selection.selectStation(bern);
  canvas.handlers.pointermove(mouseMove(5, 5));
  assert.ok(!hoverPopover.calls.some((call) => call[0] === 'showAt'));
});

test('touch input never triggers a hover popover', () => {
  const hoverPopover = makeFakePopover();
  const { selection } = makeSelection({
    hoverPopover,
    panel: { stationAt: () => ({ east: 1, north: 2, name: 'Thun' }) },
  });
  const canvas = makeFakeCanvas();
  selection.attachTo(canvas);

  canvas.handlers.pointermove({
    pointerType: 'touch',
    buttons: 0,
    clientX: 5,
    clientY: 5,
  });
  assert.equal(hoverPopover.calls.length, 0);
});
