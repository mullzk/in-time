import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MapSelection, sameSelectionTarget } from './mapSelection.js';

const station = (station) => ({ kind: 'station', station });
const vehicle = (positionEngineIndex, tripIndex) => ({
  kind: 'vehicle',
  vehicle: { positionEngineIndex, tripIndex },
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
  const focused = [];
  const context = {
    camera,
    time: { current: 0 },
    focusStation: (east, north) => focused.push([east, north]),
  };
  const selection = new MapSelection(null, panel ?? {}, context, {
    popover: popover ?? makeFakePopover(),
    hoverPopover: hoverPopover ?? makeFakePopover(),
  });
  return { selection, camera, focused };
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

const railPanel = (station) => ({
  railStationNear: () => station,
  vehicleAt: () => null,
  minorStationNear: () => null,
});

const vehiclePanel = (vehicle, position) => ({
  railStationNear: () => null,
  vehicleAt: () => vehicle,
  minorStationNear: () => null,
  describeVehicle: () => ({ label: 'Tram', origin: 'A', destination: 'B' }),
  vehiclePosition: () => position,
});

test('hovering a station shows a popover that re-anchors each frame', () => {
  const hoverPopover = makeFakePopover();
  const bern = { east: 100, north: 200, name: 'Bern' };
  const { selection, camera } = makeSelection({
    hoverPopover,
    panel: railPanel(bern),
  });
  const canvas = makeFakeCanvas();
  selection.attachTo(canvas);

  canvas.handlers.pointermove(mouseMove(5, 5));
  assert.deepEqual(hoverPopover.calls.at(-1), ['showAt', 100, 200]);

  camera.pan = 50;
  selection.onFrameRendered();
  assert.deepEqual(hoverPopover.calls.at(-1), ['moveTo', 150, 200]);
});

test('hovering a vehicle shows and follows it', () => {
  const hoverPopover = makeFakePopover();
  const bus = { east: 5, north: 6, positionEngineIndex: 0, tripIndex: 1 };
  const { selection } = makeSelection({
    hoverPopover,
    panel: vehiclePanel(bus, { east: 7, north: 6 }),
  });
  const canvas = makeFakeCanvas();
  selection.attachTo(canvas);

  canvas.handlers.pointermove(mouseMove(5, 5));
  assert.deepEqual(hoverPopover.calls.at(-1), ['showLines', 5, 6]);

  selection.onFrameRendered();
  assert.deepEqual(hoverPopover.calls.at(-1), ['moveTo', 7, 6]);
});

test('a hovered vehicle whose trip ended hides its popover', () => {
  const hoverPopover = makeFakePopover();
  const bus = { east: 5, north: 6, positionEngineIndex: 0, tripIndex: 1 };
  const panel = vehiclePanel(bus, { east: 7, north: 6 });
  const { selection } = makeSelection({ hoverPopover, panel });
  const canvas = makeFakeCanvas();
  selection.attachTo(canvas);

  canvas.handlers.pointermove(mouseMove(5, 5));
  panel.vehiclePosition = () => null;
  selection.onFrameRendered();
  assert.deepEqual(hoverPopover.calls.at(-1), ['hide']);
});

test('leaving a hovered station hides its popover', () => {
  const hoverPopover = makeFakePopover();
  const bern = { east: 100, north: 200, name: 'Bern' };
  const { selection } = makeSelection({ hoverPopover, panel: railPanel(bern) });
  const canvas = makeFakeCanvas();
  selection.attachTo(canvas);

  canvas.handlers.pointermove(mouseMove(5, 5));
  canvas.handlers.pointerleave();
  assert.deepEqual(hoverPopover.calls.at(-1), ['hide']);
});

test('hovering the already-selected station shows no hover popover', () => {
  const hoverPopover = makeFakePopover();
  const bern = { east: 100, north: 200, name: 'Bern' };
  const { selection } = makeSelection({ hoverPopover, panel: railPanel(bern) });
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
    panel: railPanel({ east: 1, north: 2, name: 'Thun' }),
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

const tap = (canvas, clientX, clientY) => {
  canvas.handlers.pointerdown({ pointerId: 1, clientX, clientY });
  canvas.handlers.pointerup({ pointerId: 1, clientX, clientY });
};

test('clicking a rail station reveals its layer, zooms and selects it', () => {
  const popover = makeFakePopover();
  const bern = { east: 100, north: 200, name: 'Bern' };
  const revealed = [];
  const panel = {
    railStationNear: () => bern,
    vehicleAt: () => null,
    minorStationNear: () => null,
    revealStation: (station) => revealed.push(station),
  };
  const { selection, focused } = makeSelection({ popover, panel });
  const canvas = makeFakeCanvas();
  selection.attachTo(canvas);

  tap(canvas, 5, 5);
  assert.deepEqual(revealed, [bern]);
  assert.deepEqual(focused, [[100, 200]]);
  assert.deepEqual(popover.calls.at(-1), ['showAt', 100, 200]);
});

test('a rail station wins over a vehicle on top of it', () => {
  const popover = makeFakePopover();
  const bern = { east: 100, north: 200, name: 'Bern' };
  const revealed = [];
  const panel = {
    railStationNear: () => bern,
    vehicleAt: () => ({
      east: 5,
      north: 6,
      positionEngineIndex: 0,
      tripIndex: 1,
    }),
    minorStationNear: () => null,
    revealStation: (station) => revealed.push(station),
  };
  const { selection } = makeSelection({ popover, panel });
  const canvas = makeFakeCanvas();
  selection.attachTo(canvas);

  tap(canvas, 5, 5);
  assert.deepEqual(revealed, [bern]);
});

test('a vehicle wins over a nearby tram or bus stop', () => {
  const popover = makeFakePopover();
  const revealed = [];
  const panel = {
    railStationNear: () => null,
    vehicleAt: () => ({
      east: 5,
      north: 6,
      positionEngineIndex: 0,
      tripIndex: 1,
    }),
    minorStationNear: () => ({ east: 100, north: 200, name: 'Tramhalt' }),
    revealStation: (station) => revealed.push(station),
    describeVehicle: () => ({ label: 'Tram', origin: 'A', destination: 'B' }),
  };
  const { selection } = makeSelection({ popover, panel });
  const canvas = makeFakeCanvas();
  selection.attachTo(canvas);

  tap(canvas, 5, 5);
  assert.deepEqual(popover.calls.at(-1), ['showLines', 5, 6]);
  assert.deepEqual(revealed, []);
});

test('a panel that frames a chosen station itself is left to do it', () => {
  const bern = { east: 100, north: 200, name: 'Bern' };
  const framed = [];
  const panel = {
    railStationNear: () => bern,
    vehicleAt: () => null,
    minorStationNear: () => null,
    revealStation: () => {},
    frameStation: (context, station) => framed.push(station),
  };
  const { selection, focused } = makeSelection({
    popover: makeFakePopover(),
    panel,
  });
  const canvas = makeFakeCanvas();
  selection.attachTo(canvas);

  tap(canvas, 5, 5);

  assert.deepEqual(framed, [bern]);
  assert.deepEqual(focused, [], 'the shared move-in is not used as well');
});
