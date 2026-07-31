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

// Which shortcuts are in effect right now. An overlay owns its own keys at all
// times -- the info modal is opened with the same key that closes it -- while the
// panel's keys and the built-in view controls fall silent as soon as any overlay
// is open, so nothing acts on the view behind it. Modal is a state, not a
// component: the small-viewport sidebar becomes one of these overlays too.
export function activeShortcuts(panelBindings, overlays) {
  const overlayBindings = Object.assign({}, ...overlays.map((o) => o.bindings));
  const anyOverlayOpen = overlays.some((overlay) => overlay.isOpen);
  return {
    bindings: anyOverlayOpen
      ? overlayBindings
      : { ...panelBindings, ...overlayBindings },
    viewControlsActive: !anyOverlayOpen,
  };
}

// Document-level keyboard shortcuts for playback and camera, plus panel-supplied
// bindings (key -> handler) for panel-specific toggles and the overlays that
// claim keys of their own. Bound to a target (window) so they work regardless of
// focus; modifier combinations are left to the browser. Reserved for later:
// n (network toggle), l (labels layer).
export class KeyboardControls {
  // `overlays` is a list of { isOpen, bindings }; isOpen is read at each key
  // press, so an overlay may open and close over the shell's lifetime.
  constructor(target, { time, camera, bindings = {}, overlays = [] }) {
    this.time = time;
    this.camera = camera;
    this.bindings = bindings;
    this.overlays = overlays;
    target.addEventListener('keydown', (event) => this.#onKeyDown(event));
  }

  #onKeyDown(event) {
    if (event.metaKey || event.ctrlKey || event.altKey) {
      return;
    }
    if (this.#isTypingInto(event.target)) {
      return;
    }
    const active = activeShortcuts(this.bindings, this.overlays);
    const binding = active.bindings[normalizedBindingKey(event.key)];
    if (binding) {
      binding();
      event.preventDefault();
      return;
    }
    if (!active.viewControlsActive) {
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
