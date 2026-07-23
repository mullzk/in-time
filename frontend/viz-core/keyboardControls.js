const ZOOM_KEY_FACTOR = 1.4;

// Document-level keyboard shortcuts for playback and camera. Bound to a target
// (window) so they work regardless of focus; modifier combinations are left to
// the browser. Reserved for later, once those layers exist: n (network),
// h (stops), l (labels).
export class KeyboardControls {
  constructor(target, { time, camera }) {
    this.time = time;
    this.camera = camera;
    target.addEventListener('keydown', (event) => this.#onKeyDown(event));
  }

  #onKeyDown(event) {
    if (event.metaKey || event.ctrlKey || event.altKey) {
      return;
    }
    switch (event.key) {
      case ' ':
        if (!event.repeat) {
          this.time.togglePlay();
        }
        break;
      case '+':
      case '=':
        this.#zoomAroundCentre(ZOOM_KEY_FACTOR);
        break;
      case '-':
      case '_':
        this.#zoomAroundCentre(1 / ZOOM_KEY_FACTOR);
        break;
      case 'f':
      case 'F':
        this.camera.fit();
        break;
      default:
        return;
    }
    event.preventDefault();
  }

  #zoomAroundCentre(factor) {
    this.camera.zoomAt(
      this.camera.viewportWidth / 2,
      this.camera.viewportHeight / 2,
      factor,
    );
  }
}
