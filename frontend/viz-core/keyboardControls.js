const ZOOM_KEY_FACTOR = 1.4;

// Focusable controls that are not text fields, so shortcuts keep working while
// one of them holds focus (a clicked checkbox stays focused until blurred).
const NON_TYPING_INPUT_TYPES = new Set([
  'checkbox',
  'radio',
  'range',
  'button',
  'submit',
  'reset',
  'file',
  'color',
]);

export function isTypingElement(tagName, inputType, isContentEditable) {
  if (isContentEditable) {
    return true;
  }
  if (tagName === 'TEXTAREA') {
    return true;
  }
  if (tagName === 'INPUT') {
    return !NON_TYPING_INPUT_TYPES.has(inputType);
  }
  return false;
}

// Panel bindings are single letters; Shift or Caps Lock report an uppercase
// event.key, so fold single-character keys to match the binding either way.
export function normalizedBindingKey(key) {
  return key.length === 1 ? key.toLowerCase() : key;
}

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
    const binding = this.bindings[normalizedBindingKey(event.key)];
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
      isTypingElement(target.tagName, target.type, target.isContentEditable)
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
