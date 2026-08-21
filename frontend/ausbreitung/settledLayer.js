import { applyCameraTransform } from '../viz-core/cameraTransform.js';

const NO_RUN = -1;
const FROM_THE_BEGINNING = 0;

// The places that have settled are a picture that only grows, so it is painted
// once into a layer of its own and added to as further places settle. A frame
// then draws one image instead of twenty thousand dots -- which the browser
// rasterises even when the drawing itself costs nothing: measured on a full day,
// 33 ms a frame before, 8 ms after. The layer holds screen pixels, so a moved
// camera, a spread run backwards or a new spread means painting it anew.
//
// What is added to it must not carry the order of the arrivals into a picture
// that is about the ranks: a bus stop reached late would else lie over the
// station it stands at. Whatever is drawn over a run that has just been added to
// is therefore painted anew, whole. That is the smaller half of the picture --
// the traffic outranking the buses -- and it costs, measured on a spread over
// the whole country, 0.9 ms a frame before and 1.3 ms after.
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

  // The runs come in the order they are drawn, the highest-ranking traffic last.
  // The lowest one with places to add decides the work: it is added to, whatever
  // lies over it is painted anew -- its new places may have buried some of it --
  // and what lies under it has nothing new and stays as it is.
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
