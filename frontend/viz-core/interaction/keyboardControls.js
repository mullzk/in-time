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

// Document-level keyboard shortcuts for the camera and, where a view plays at
// all, for playback, plus the bindings a shell supplies (key -> handler). Bound
// to a target (window) so they work regardless of focus; modifier combinations
// are left to the browser.
export class KeyboardControls {
  constructor(target, { togglePlay, camera, bindings = {} }) {
    this.togglePlay = togglePlay;
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
          this.togglePlay?.();
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
      target != null &&
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
