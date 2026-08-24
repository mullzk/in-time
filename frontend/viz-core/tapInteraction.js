const TAP_MOVE_PIXELS = 8;
const DOUBLE_CLICK_MS = 300;

// Turns canvas taps into target selections: a tap (pointer down and up without a
// drag) picks the target under it — a station or a vehicle — and reports it
// through onSelect together with the kind of pointer that tapped, which is what
// lets a caller ask a finger for a second tap where a mouse needs none. A second
// click on the same target within DOUBLE_CLICK_MS activates it — the double
// click is a mouse idiom and is read from the mouse alone. Panning drags and
// multi-finger gestures never count as taps, so this coexists with the camera
// controls on the same canvas: a pinch ends with a finger lifting off a place it
// never meant to choose. onPointerDown fires the moment a pointer is set down,
// onNothingTapped only once a completed tap has hit nothing. Time comes from the
// caller so the module stays free of the clock. `sameTarget(a, b)` decides
// double-click identity (default reference equality) for callers whose picks are
// fresh wrappers rather than stable objects.
export class TapInteraction {
  constructor(
    canvasElement,
    {
      pick,
      onSelect,
      onActivate,
      onPointerDown,
      onNothingTapped,
      now,
      sameTarget,
    },
  ) {
    this.canvas = canvasElement;
    this.pick = pick;
    this.onSelect = onSelect;
    this.onActivate = onActivate;
    this.onPointerDown = onPointerDown;
    this.onNothingTapped = onNothingTapped ?? (() => {});
    this.now = now ?? (() => performance.now());
    this.sameTarget = sameTarget ?? ((first, second) => first === second);
    this.activePointers = new Set();
    this.downPoint = null;
    this.downPointerId = null;
    this.lastTap = null;
    this.#bind();
  }

  #bind() {
    this.canvas.addEventListener('pointerdown', (event) =>
      this.#onPointerDown(event),
    );
    this.canvas.addEventListener('pointerup', (event) =>
      this.#onPointerUp(event),
    );
    this.canvas.addEventListener('pointercancel', (event) =>
      this.#onPointerCancel(event),
    );
  }

  #onPointerDown(event) {
    this.activePointers.add(event.pointerId);
    if (this.activePointers.size > 1) {
      this.downPoint = null;
      return;
    }
    this.downPoint = this.#localPoint(event);
    this.downPointerId = event.pointerId;
    this.onPointerDown();
  }

  #localPoint(event) {
    const rect = this.canvas.getBoundingClientRect();
    return [event.clientX - rect.left, event.clientY - rect.top];
  }

  #onPointerCancel(event) {
    this.activePointers.delete(event.pointerId);
    if (event.pointerId === this.downPointerId) {
      this.downPoint = null;
    }
  }

  #onPointerUp(event) {
    this.activePointers.delete(event.pointerId);
    if (this.downPoint === null || event.pointerId !== this.downPointerId) {
      return;
    }
    const [x, y] = this.#localPoint(event);
    const moved = Math.hypot(x - this.downPoint[0], y - this.downPoint[1]);
    this.downPoint = null;
    if (moved <= TAP_MOVE_PIXELS) {
      this.#onTap(x, y, event.pointerType);
    }
  }

  #onTap(x, y, pointerType) {
    const target = this.pick(x, y);
    if (target === null) {
      this.lastTap = null;
      this.onNothingTapped();
      return;
    }
    const now = this.now();
    const isDoubleClick =
      pointerType === 'mouse' &&
      this.lastTap !== null &&
      this.sameTarget(this.lastTap.target, target) &&
      now - this.lastTap.time < DOUBLE_CLICK_MS;
    if (isDoubleClick) {
      this.onActivate(target);
      this.lastTap = null;
    } else {
      this.onSelect(target, pointerType);
      this.lastTap = { target, time: now };
    }
  }
}
