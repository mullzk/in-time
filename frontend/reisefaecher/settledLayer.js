import { applyCameraTransform } from '../viz-core/render/cameraTransform.js';

const NO_RUN = -1;
const FROM_THE_BEGINNING = 0;

// The settled places only ever grow, so they are painted once into a layer of
// their own and added to as further places settle: a frame draws one image
// instead of twenty thousand dots (33 ms a frame before, 8 ms after, on a full
// day). The layer holds screen pixels, so a moved camera, a spread run
// backwards or a new spread means painting it anew.
//
// Adding to a run may bury places of a higher-ranking run, so everything drawn
// over the run added to is repainted whole (0.9 ms a frame before, 1.3 ms
// after, on a spread over the whole country).
export class SettledLayer {
  constructor(p, colorOf) {
    this.graphics = p.createGraphics(p.width, p.height);
    this.colorOf = colorOf;
    this.painted = null;
    this.paintedUntil = new Map();
  }

  forget() {
    this.painted = null;
  }

  fitsCanvas(width, height) {
    return this.graphics.width === width && this.graphics.height === height;
  }

  // The runs come in the order they are drawn, the highest-ranking last. The
  // lowest one with new places decides the work: it is added to, everything
  // over it is repainted, everything under it stays as it is.
  paint(camera, runs, diameterOf) {
    this.#startOverIfStale(camera, runs);
    const lowestRunWithNewPlaces = runs.findIndex((run) =>
      this.#hasNewPlaces(run),
    );
    if (lowestRunWithNewPlaces === NO_RUN) {
      return;
    }
    runs.slice(lowestRunWithNewPlaces).forEach((run, offset) => {
      const from =
        offset === 0 ? this.#placesOnTheLayer(run) : FROM_THE_BEGINNING;
      this.#paintRun(camera, run, diameterOf(run.category), from);
    });
  }

  drawOnto(p) {
    p.push();
    p.resetMatrix();
    p.image(this.graphics, 0, 0);
    p.pop();
  }

  #startOverIfStale(camera, runs) {
    const view = viewSignature(camera);
    if (this.painted === view && !this.#anyRunShrank(runs)) {
      return;
    }
    this.graphics.clear();
    this.paintedUntil.clear();
    this.painted = view;
  }

  #anyRunShrank(runs) {
    return runs.some((run) => run.settledUntil < this.#placesOnTheLayer(run));
  }

  #hasNewPlaces(run) {
    return run.settledUntil > this.#placesOnTheLayer(run);
  }

  #placesOnTheLayer(run) {
    return this.paintedUntil.get(run.category) ?? 0;
  }

  #paintRun(camera, run, diameter, from) {
    if (run.settledUntil <= from) {
      return;
    }
    const graphics = this.graphics;
    graphics.push();
    graphics.resetMatrix();
    applyCameraTransform(graphics, camera);
    // Every place of a run goes into one path that is filled once, which keeps
    // a full repaint affordable. Drawn through the raw canvas context rather
    // than through p5: p5 renders a POINTS vertex as a line 1e-5 long with a
    // round cap, and at this camera scale WebKit drops that segment.
    const context = graphics.drawingContext;
    const radius = diameter / 2;
    context.fillStyle = rgba(this.colorOf(run.category));
    context.beginPath();
    run.easts.subarray(from, run.settledUntil).forEach((east, offset) => {
      const north = run.norths[from + offset];
      context.moveTo(east + radius, north);
      context.arc(east, north, radius, 0, FULL_TURN);
    });
    context.fill();
    graphics.pop();
    this.paintedUntil.set(run.category, run.settledUntil);
  }
}

const FULL_TURN = Math.PI * 2;

const rgba = ([red, green, blue, alpha]) =>
  `rgba(${red}, ${green}, ${blue}, ${alpha / 255})`;

const viewSignature = (camera) =>
  [
    camera.centerEast,
    camera.centerNorth,
    camera.scale,
    camera.viewportWidth,
    camera.viewportHeight,
  ].join(':');
