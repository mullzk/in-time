const ZOOM_STEP = 1.1;

// Two fingers that travel together are panning, not pinching, so the zoom holds
// back until their spacing has really changed. Without it every two-finger pan
// zooms a little on the way.
const PINCH_ZOOM_DEADZONE_PIXELS = 8;

// Translates canvas pointer and wheel gestures into camera pan/zoom. Bound to
// the canvas element itself, so a gesture on a DOM control (scrubber, tempo,
// play) never reaches the camera. Pointer events unify mouse, touch and
// pen; two active pointers pinch-zoom and pan together.
export class CameraControls {
  // onZoomGesture fires on the center-shifting zooms (wheel, pinch), not on the
  // centre-preserving ones the keyboard and the zoom slider drive.
  constructor(canvasElement, camera, { onZoomGesture } = {}) {
    this.canvas = canvasElement;
    this.camera = camera;
    this.onZoomGesture = onZoomGesture ?? (() => {});
    this.activePointers = new Map();
    this.pinch = null;
    this.#bind();
  }

  #bind() {
    const canvas = this.canvas;
    canvas.addEventListener('wheel', (event) => this.#onWheel(event), {
      passive: false,
    });
    canvas.addEventListener('pointerdown', (event) =>
      this.#onPointerDown(event),
    );
    canvas.addEventListener('pointermove', (event) =>
      this.#onPointerMove(event),
    );
    canvas.addEventListener('pointerup', (event) => this.#onPointerUp(event));
    canvas.addEventListener('pointercancel', (event) =>
      this.#onPointerUp(event),
    );
  }

  #localPoint(event) {
    const rect = this.canvas.getBoundingClientRect();
    return [event.clientX - rect.left, event.clientY - rect.top];
  }

  #onWheel(event) {
    event.preventDefault();
    const [x, y] = this.#localPoint(event);
    this.camera.zoomAt(x, y, event.deltaY > 0 ? 1 / ZOOM_STEP : ZOOM_STEP);
    this.onZoomGesture();
  }

  #onPointerDown(event) {
    this.canvas.setPointerCapture(event.pointerId);
    this.activePointers.set(event.pointerId, this.#localPoint(event));
  }

  #onPointerMove(event) {
    if (!this.activePointers.has(event.pointerId)) {
      return;
    }
    const previous = this.activePointers.get(event.pointerId);
    const current = this.#localPoint(event);
    this.activePointers.set(event.pointerId, current);
    this.#applyGesture(previous, current);
  }

  #onPointerUp(event) {
    this.activePointers.delete(event.pointerId);
    if (this.activePointers.size < 2) {
      this.pinch = null;
    }
  }

  #applyGesture(previous, current) {
    const points = [...this.activePointers.values()];
    if (points.length === 1) {
      this.#pan(previous, current);
    } else if (points.length === 2) {
      this.#pinch(points);
    }
  }

  #pan(previous, current) {
    this.camera.panBy(current[0] - previous[0], current[1] - previous[1]);
  }

  // The midpoint between the fingers pans, their spacing zooms about that same
  // midpoint. Panning first puts the grasped place back under the fingers, so
  // zooming about the new midpoint leaves it there.
  #pinch(points) {
    const centre = midpointOf(points);
    const distance = spreadOf(points);
    if (this.pinch === null) {
      this.pinch = { centre, distance, startDistance: distance, zooms: false };
      return;
    }
    this.camera.panBy(
      centre[0] - this.pinch.centre[0],
      centre[1] - this.pinch.centre[1],
    );
    const zooms =
      this.pinch.zooms ||
      Math.abs(distance - this.pinch.startDistance) >
        PINCH_ZOOM_DEADZONE_PIXELS;
    if (zooms) {
      this.camera.zoomAt(centre[0], centre[1], distance / this.pinch.distance);
      this.onZoomGesture();
    }
    this.pinch = {
      centre,
      distance,
      startDistance: this.pinch.startDistance,
      zooms,
    };
  }
}

const midpointOf = ([first, second]) => [
  (first[0] + second[0]) / 2,
  (first[1] + second[1]) / 2,
];

const spreadOf = ([first, second]) =>
  Math.hypot(first[0] - second[0], first[1] - second[1]);
