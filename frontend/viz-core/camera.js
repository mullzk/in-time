export const CH_BOUNDS_LV95 = {
  eastMin: 2_485_000,
  eastMax: 2_834_000,
  northMin: 1_075_000,
  northMax: 1_296_000,
};

// Maximum zoom-in: 1300 px span roughly 3 km.
export const SCALE_MAX_PIXELS_PER_METRE = 1300 / 3000;

// Maximum zoom-out leaves a 10% margin around the national extent.
const FIT_MARGIN = 1.1;

const clamp = (value, low, high) => Math.min(Math.max(value, low), high);

export class Camera {
  constructor(viewportWidth, viewportHeight) {
    this.viewportWidth = viewportWidth;
    this.viewportHeight = viewportHeight;
    this.centerEast = (CH_BOUNDS_LV95.eastMin + CH_BOUNDS_LV95.eastMax) / 2;
    this.centerNorth = (CH_BOUNDS_LV95.northMin + CH_BOUNDS_LV95.northMax) / 2;
    this.scale = this.#minScale();
  }

  #minScale() {
    const chWidth = CH_BOUNDS_LV95.eastMax - CH_BOUNDS_LV95.eastMin;
    const chHeight = CH_BOUNDS_LV95.northMax - CH_BOUNDS_LV95.northMin;
    return Math.min(
      this.viewportWidth / (chWidth * FIT_MARGIN),
      this.viewportHeight / (chHeight * FIT_MARGIN),
    );
  }

  #clampScale(scale) {
    return clamp(scale, this.#minScale(), SCALE_MAX_PIXELS_PER_METRE);
  }

  #clampCenter() {
    this.centerEast = clamp(
      this.centerEast,
      CH_BOUNDS_LV95.eastMin,
      CH_BOUNDS_LV95.eastMax,
    );
    this.centerNorth = clamp(
      this.centerNorth,
      CH_BOUNDS_LV95.northMin,
      CH_BOUNDS_LV95.northMax,
    );
  }

  worldToScreen(east, north) {
    return [
      this.viewportWidth / 2 + (east - this.centerEast) * this.scale,
      this.viewportHeight / 2 - (north - this.centerNorth) * this.scale,
    ];
  }

  screenToWorld(x, y) {
    return [
      this.centerEast + (x - this.viewportWidth / 2) / this.scale,
      this.centerNorth - (y - this.viewportHeight / 2) / this.scale,
    ];
  }

  setViewport(viewportWidth, viewportHeight) {
    this.viewportWidth = viewportWidth;
    this.viewportHeight = viewportHeight;
    this.scale = this.#clampScale(this.scale);
    this.#clampCenter();
  }

  // Zooming must keep the world point under the cursor pinned there; changing
  // `scale` alone would zoom toward the viewport centre instead. So we remember
  // the world point under the cursor, rescale, then move the centre so that same
  // point projects back onto the cursor — worldToScreen solved for the centre,
  // where north-up flips the y sign.
  zoomAt(screenX, screenY, factor) {
    const [anchorEast, anchorNorth] = this.screenToWorld(screenX, screenY);
    const cursorOffsetX = screenX - this.viewportWidth / 2;
    const cursorOffsetY = screenY - this.viewportHeight / 2;

    this.scale = this.#clampScale(this.scale * factor);

    this.centerEast = anchorEast - cursorOffsetX / this.scale;
    this.centerNorth = anchorNorth + cursorOffsetY / this.scale;
    this.#clampCenter();
  }

  panBy(deltaXPixels, deltaYPixels) {
    this.centerEast -= deltaXPixels / this.scale;
    this.centerNorth += deltaYPixels / this.scale;
    this.#clampCenter();
  }
}
