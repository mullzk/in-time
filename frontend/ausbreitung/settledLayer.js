import { applyCameraTransform } from '../viz-core/cameraTransform.js';

// The places that have settled are a picture that only grows, so it is painted
// once into a layer of its own and added to as further places settle. A frame
// then draws one image instead of twenty thousand dots -- which the browser
// rasterises even when the drawing itself costs nothing: measured on a full day,
// 33 ms a frame before, 8 ms after. The layer holds screen pixels, so a moved
// camera, a spread run backwards or a new spread means painting it anew.
export class SettledLayer {
  constructor(p, colorOf) {
    this.graphics = p.createGraphics(p.width, p.height);
    this.points = p.POINTS;
    this.roundCap = p.ROUND;
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

  paint(camera, runs, diameterOf) {
    this.#startOverIfStale(camera, runs);
    runs.forEach((run) => {
      this.#paintRun(camera, run, diameterOf(run.category));
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
    return runs.some(
      (run) => run.settledUntil < (this.paintedUntil.get(run.category) ?? 0),
    );
  }

  #paintRun(camera, run, diameter) {
    const from = this.paintedUntil.get(run.category) ?? 0;
    if (run.settledUntil <= from) {
      return;
    }
    const graphics = this.graphics;
    const [red, green, blue, alpha] = this.colorOf(run.category);
    graphics.push();
    graphics.resetMatrix();
    applyCameraTransform(graphics, camera);
    graphics.noFill();
    graphics.stroke(red, green, blue, alpha);
    graphics.strokeWeight(diameter);
    graphics.strokeCap(this.roundCap);
    graphics.beginShape(this.points);
    run.easts.subarray(from, run.settledUntil).forEach((east, offset) => {
      graphics.vertex(east, run.norths[from + offset]);
    });
    graphics.endShape();
    graphics.pop();
    this.paintedUntil.set(run.category, run.settledUntil);
  }
}

const viewSignature = (camera) =>
  [
    camera.centerEast,
    camera.centerNorth,
    camera.scale,
    camera.viewportWidth,
    camera.viewportHeight,
  ].join(':');
