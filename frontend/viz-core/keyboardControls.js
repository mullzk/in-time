const ZOOM_KEY_FACTOR = 1.4;

// Document-level keyboard shortcuts for playback and camera, plus panel-supplied
// bindings (key -> handler) for panel-specific toggles. Bound to a target
// (window) so they work regardless of focus; modifier combinations are left to
// the browser. Reserved for later: n (network toggle), l (labels layer).
export class KeyboardControls {
  constructor(target, { time, camera, bindings = {} }) {
    this.time = time;
    this.camera = camera;
    this.bindings = bindings;
    target.addEventListener('keydown', (event) => this.#onKeyDown(event));
  }

  #onKeyDown(event) {
    if (event.metaKey || event.ctrlKey || event.altKey) {
      return;
    }
    if (this.#isTypingInto(event.target)) {
      return;
    }
    const binding = this.bindings[event.key];
    if (binding) {
      binding();
      event.preventDefault();
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

  #isTypingInto(target) {
    return (
      target instanceof HTMLElement &&
      (target.isContentEditable ||
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA')
    );
  }

  #zoomAroundCentre(factor) {
    this.camera.zoomAt(
      this.camera.viewportWidth / 2,
      this.camera.viewportHeight / 2,
      factor,
    );
  }
}
