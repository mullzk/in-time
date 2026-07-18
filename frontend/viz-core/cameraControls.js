const ZOOM_STEP = 1.1;

// Translates canvas pointer and wheel gestures into camera pan/zoom. Bound to
// the canvas element itself, so a gesture on a DOM cockpit control (scrubber,
// tempo, play) never reaches the camera. Pointer events unify mouse, touch and
// pen; two active pointers pinch-zoom.
export class CameraControls {
  constructor(canvasElement, camera) {
    this.canvas = canvasElement;
    this.camera = camera;
    this.activePointers = new Map();
    this.pinchDistance = null;
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
      this.pinchDistance = null;
    }
  }

  #applyGesture(previous, current) {
    const points = [...this.activePointers.values()];
    if (points.length === 1) {
      this.#pan(previous, current);
    } else if (points.length === 2) {
      this.#pinchZoom(points);
    }
  }

  #pan(previous, current) {
    this.camera.panBy(current[0] - previous[0], current[1] - previous[1]);
  }

  #pinchZoom([first, second]) {
    const distance = Math.hypot(first[0] - second[0], first[1] - second[1]);
    if (this.pinchDistance !== null) {
      this.camera.zoomAt(
        (first[0] + second[0]) / 2,
        (first[1] + second[1]) / 2,
        distance / this.pinchDistance,
      );
    }
    this.pinchDistance = distance;
  }
}
