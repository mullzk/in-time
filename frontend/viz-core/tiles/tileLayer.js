import {
  selectLevel,
  tileSpanMetres,
  tileWorldBounds,
  visibleTiles,
} from './tileMatrixSet.js';

const DEFAULT_CACHE_LIMIT = 256;

// Draws the swisstopo raster substrate coincident with the geometry: it picks a
// zoom level from the camera, fetches the visible tiles (same-origin, via the
// proxy), keeps the decoded p5.Image objects in an LRU, and paints each tile in
// LV95 world coordinates. `p` is a p5 instance; it is passed per frame so the
// layer never has to own the loop's p5.
export class TileLayer {
  constructor(source, { cacheLimit = DEFAULT_CACHE_LIMIT } = {}) {
    this.source = source;
    this.cacheLimit = cacheLimit;
    this.cache = new Map();
  }

  draw(p, camera) {
    const level = selectLevel(camera.worldPerPixel());
    const span = tileSpanMetres(level);
    p.push();
    p.imageMode(p.CORNER);
    visibleTiles(level, camera.visibleWorldBounds()).forEach(({ col, row }) => {
      const image = this.#imageFor(p, level, col, row);
      if (!image) {
        return;
      }
      const bounds = tileWorldBounds(level, col, row);
      p.push();
      // The camera flips y (north up); undo it locally so the top-down raster
      // sits upright with its top-left corner at (eastMin, northMax).
      p.translate(bounds.eastMin, bounds.northMax);
      p.scale(1, -1);
      p.image(image, 0, 0, span, span);
      p.pop();
    });
    p.pop();
    this.#evictBeyondLimit();
  }

  #imageFor(p, z, x, y) {
    const key = `${z}/${x}/${y}`;
    const cached = this.cache.get(key);
    if (cached !== undefined) {
      this.#markRecentlyUsed(key, cached);
      return cached === 'loading' || cached === 'error' ? null : cached;
    }
    this.cache.set(key, 'loading');
    p.loadImage(
      this.source.urlFor(z, x, y),
      (image) => this.cache.set(key, image),
      () => this.cache.set(key, 'error'),
    );
    return null;
  }

  #markRecentlyUsed(key, value) {
    this.cache.delete(key);
    this.cache.set(key, value);
  }

  #evictBeyondLimit() {
    while (this.cache.size > this.cacheLimit) {
      const oldest = this.cache.keys().next().value;
      this.cache.delete(oldest);
    }
  }
}
