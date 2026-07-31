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
// the browser. `modalSafeBindings` are the shortcuts a modal dialog owns and
// keeps while it is open, `isModalOpen` reports that state -- everything else
// stays silent then, so keys do not act on the view behind the dialog.
// Reserved for later: n (network toggle), l (labels layer).
export class KeyboardControls {
  constructor(
    target,
    {
      time,
      camera,
      bindings = {},
      modalSafeBindings = {},
      isModalOpen = () => false,
    },
  ) {
    this.time = time;
    this.camera = camera;
    this.bindings = bindings;
    this.modalSafeBindings = modalSafeBindings;
    this.isModalOpen = isModalOpen;
    target.addEventListener('keydown', (event) => this.#onKeyDown(event));
  }

  #onKeyDown(event) {
    if (event.metaKey || event.ctrlKey || event.altKey) {
      return;
    }
    if (this.#isTypingInto(event.target)) {
      return;
    }
    const key = normalizedBindingKey(event.key);
    const modalSafe = this.modalSafeBindings[key];
    if (modalSafe) {
      modalSafe();
      event.preventDefault();
      return;
    }
    if (this.isModalOpen()) {
      return;
    }
    const binding = this.bindings[key];
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
