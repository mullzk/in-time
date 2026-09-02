export const CH_BOUNDS_LV95 = {
  eastMin: 2_485_000,
  eastMax: 2_834_000,
  northMin: 1_075_000,
  northMax: 1_296_000,
};

// Maximum zoom-in: 150 px span 1 km (~6.7 m/px).
export const SCALE_MAX_PIXELS_PER_METRE = 150 / 1000;

// Maximum zoom-out leaves a 10% margin around the national extent.
const FIT_MARGIN = 1.1;

// A hair above the minimum scale so float drift at the fully-zoomed-out stop
// still counts as zoomed out, but a single zoom-in step no longer does.
const FULLY_ZOOMED_OUT_TOLERANCE = 1.01;

const clamp = (value, low, high) => Math.min(Math.max(value, low), high);

export class Camera {
  constructor(viewportWidth, viewportHeight, bounds = CH_BOUNDS_LV95) {
    this.viewportWidth = viewportWidth;
    this.viewportHeight = viewportHeight;
    this.bounds = bounds;
    this.fit();
  }

  // The extent the view may roam over and must be able to show whole; a panel
  // whose picture reaches beyond the country says how far.
  setWorldBounds(bounds) {
    this.bounds = bounds;
    this.scale = this.#clampScale(this.scale);
    this.#clampCenter();
  }

  // Re-centre on the extent and zoom out so all of it fits.
  fit() {
    this.frameOn(this.bounds);
  }

  // Re-centre on a part of the world and zoom so that part fits the viewport in
  // both directions, whatever shape the viewport has.
  frameOn(bounds) {
    this.centerEast = (bounds.eastMin + bounds.eastMax) / 2;
    this.centerNorth = (bounds.northMin + bounds.northMax) / 2;
    this.scale = this.#clampScale(this.#scaleThatFits(bounds));
    this.#clampCenter();
  }

  #scaleThatFits(bounds) {
    const width = bounds.eastMax - bounds.eastMin;
    const height = bounds.northMax - bounds.northMin;
    return Math.min(
      this.viewportWidth / (width * FIT_MARGIN),
      this.viewportHeight / (height * FIT_MARGIN),
    );
  }

  #minScale() {
    return this.#scaleThatFits(this.bounds);
  }

  #clampScale(scale) {
    return clamp(scale, this.#minScale(), SCALE_MAX_PIXELS_PER_METRE);
  }

  #clampCenter() {
    this.centerEast = clamp(
      this.centerEast,
      this.bounds.eastMin,
      this.bounds.eastMax,
    );
    this.centerNorth = clamp(
      this.centerNorth,
      this.bounds.northMin,
      this.bounds.northMax,
    );
  }

  worldPerPixel() {
    return 1 / this.scale;
  }

  // 0 at the fully zoomed-out fit, 1 at the maximum zoom-in, logarithmic in
  // between so equal fractions are equal zoom ratios — the basis for the
  // slider's fixed zoom steps.
  zoomFraction() {
    const minScale = this.#minScale();
    return (
      Math.log(this.scale / minScale) /
      Math.log(SCALE_MAX_PIXELS_PER_METRE / minScale)
    );
  }

  setZoomFraction(fraction) {
    const minScale = this.#minScale();
    const span = SCALE_MAX_PIXELS_PER_METRE / minScale;
    this.scale = this.#clampScale(minScale * span ** clamp(fraction, 0, 1));
    this.#clampCenter();
  }

  fullyZoomedOut() {
    return this.scale <= this.#minScale() * FULLY_ZOOMED_OUT_TOLERANCE;
  }

  visibleWorldBounds() {
    const halfWidthMetres = this.viewportWidth / 2 / this.scale;
    const halfHeightMetres = this.viewportHeight / 2 / this.scale;
    return {
      eastMin: this.centerEast - halfWidthMetres,
      eastMax: this.centerEast + halfWidthMetres,
      northMin: this.centerNorth - halfHeightMetres,
      northMax: this.centerNorth + halfHeightMetres,
    };
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

  centerOn(east, north) {
    this.centerEast = east;
    this.centerNorth = north;
    this.#clampCenter();
  }
}
