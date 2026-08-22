import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SettledLayer } from './settledLayer.js';

const camera = (scale = 1) => ({
  centerEast: 0,
  centerNorth: 0,
  scale,
  viewportWidth: 800,
  viewportHeight: 600,
});

// Records what was painted, in the terms the layer speaks: cleared, and the
// stretch of each run it drew. The places go into the raw canvas context, one
// arc each, so that is where they are caught.
const fakeGraphics = () => {
  const painted = [];
  return {
    width: 800,
    height: 600,
    painted,
    clear() {
      painted.push('clear');
    },
    push() {},
    pop() {},
    resetMatrix() {},
    translate() {},
    scale() {},
    drawingContext: {
      fillStyle: '',
      beginPath() {},
      moveTo() {},
      arc(east) {
        painted.push(east);
      },
      fill() {},
    },
  };
};

const run = (category, count, settledUntil) => ({
  category,
  easts: Float64Array.from({ length: count }, (_, index) => index),
  norths: new Float64Array(count),
  settledUntil,
});

const layerOf = () => {
  const graphics = fakeGraphics();
  const sketch = {
    width: graphics.width,
    height: graphics.height,
    createGraphics: () => graphics,
  };
  return { graphics, layer: new SettledLayer(sketch, () => [1, 2, 3, 200]) };
};

test('the first paint draws everything that has settled', () => {
  const { graphics, layer } = layerOf();

  layer.paint(camera(), [run(6, 5, 3)], () => 2);

  assert.deepEqual(graphics.painted, ['clear', 0, 1, 2]);
});

test('what has settled since is added, not painted again', () => {
  const { graphics, layer } = layerOf();
  layer.paint(camera(), [run(6, 5, 3)], () => 2);
  graphics.painted.length = 0;

  layer.paint(camera(), [run(6, 5, 5)], () => 2);

  assert.deepEqual(graphics.painted, [3, 4], 'only the two new ones');
});

test('nothing new settled means nothing is painted', () => {
  const { graphics, layer } = layerOf();
  layer.paint(camera(), [run(6, 5, 3)], () => 2);
  graphics.painted.length = 0;

  layer.paint(camera(), [run(6, 5, 3)], () => 2);

  assert.deepEqual(graphics.painted, []);
});

test('a moved camera means the layer holds the wrong pixels', () => {
  const { graphics, layer } = layerOf();
  layer.paint(camera(1), [run(6, 5, 3)], () => 2);
  graphics.painted.length = 0;

  layer.paint(camera(2), [run(6, 5, 3)], () => 2);

  assert.deepEqual(graphics.painted, ['clear', 0, 1, 2], 'painted anew');
});

test('a spread running backwards is painted anew', () => {
  const { graphics, layer } = layerOf();
  layer.paint(camera(), [run(6, 5, 4)], () => 2);
  graphics.painted.length = 0;

  layer.paint(camera(), [run(6, 5, 2)], () => 2);

  assert.deepEqual(graphics.painted, ['clear', 0, 1]);
});

test('a forgotten layer is painted anew', () => {
  const { graphics, layer } = layerOf();
  layer.paint(camera(), [run(6, 5, 3)], () => 2);
  graphics.painted.length = 0;

  layer.forget();
  layer.paint(camera(), [run(6, 5, 3)], () => 2);

  assert.deepEqual(graphics.painted, ['clear', 0, 1, 2]);
});

test('a rank drawn higher up is painted again over what settled under it', () => {
  const { graphics, layer } = layerOf();
  layer.paint(camera(), [run(6, 5, 2), run(0, 3, 1)], () => 2);
  graphics.painted.length = 0;

  layer.paint(camera(), [run(6, 5, 4), run(0, 3, 1)], () => 2);

  assert.deepEqual(
    graphics.painted,
    [2, 3, 0],
    'the two new bus stops, then the station over them again',
  );
});

test('a rank drawn under a gaining one is left where it is', () => {
  const { graphics, layer } = layerOf();
  layer.paint(camera(), [run(6, 5, 2), run(0, 3, 1)], () => 2);
  graphics.painted.length = 0;

  layer.paint(camera(), [run(6, 5, 2), run(0, 3, 3)], () => 2);

  assert.deepEqual(graphics.painted, [1, 2], 'only the new stations');
});
