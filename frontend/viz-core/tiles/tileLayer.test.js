import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TileLayer } from './tileLayer.js';

function makeFakeSketch() {
  return {
    CORNER: 'corner',
    requests: [],
    drawn: [],
    push() {},
    pop() {},
    imageMode() {},
    translate() {},
    scale() {},
    image(img) {
      this.drawn.push(img);
    },
    loadImage(url, onSuccess, onError) {
      this.requests.push({ url, onSuccess, onError });
    },
  };
}

// A camera whose visible world spans a single tile at the matrix origin, so a
// draw issues exactly one tile request and the test can reason about that tile.
const oneTileCamera = {
  worldPerPixel: () => 100,
  visibleWorldBounds: () => ({
    eastMin: 2_420_100,
    eastMax: 2_420_200,
    northMin: 1_349_800,
    northMax: 1_349_900,
  }),
};

const sourceNamed = (name) => ({
  urlFor: (z, x, y) => `${name}/${z}/${x}/${y}`,
});

test('an in-flight tile from the old source is discarded after a switch', () => {
  const sketch = makeFakeSketch();
  const layer = new TileLayer(sourceNamed('relief'));
  layer.draw(sketch, oneTileCamera);
  assert.equal(sketch.requests.length, 1);

  const staleImage = { source: 'relief' };
  layer.setSource(sourceNamed('grey'));
  sketch.requests[0].onSuccess(staleImage);

  layer.draw(sketch, oneTileCamera);
  assert.equal(sketch.drawn.includes(staleImage), false);
  assert.ok(sketch.requests[1].url.startsWith('grey/'));
});
