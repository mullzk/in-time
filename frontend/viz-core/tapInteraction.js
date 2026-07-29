const TAP_MOVE_PIXELS = 8;
const DOUBLE_TAP_MS = 300;

// Turns canvas taps into target selections: a tap (pointer down and up without a
// drag) picks the target under it — a station or a vehicle — and a second tap on
// the same target within DOUBLE_TAP_MS activates it. Panning drags never count as
// taps, so this coexists with the camera controls on the same canvas. Time comes
// from the caller so the module stays free of the clock. `sameTarget(a, b)`
// decides double-tap identity (default reference equality) for callers whose
// picks are fresh wrappers rather than stable objects.
export class TapInteraction {
  constructor(
    canvasElement,
    { pick, onSelect, onActivate, onMiss, now, sameTarget },
  ) {
    this.canvas = canvasElement;
    this.pick = pick;
    this.onSelect = onSelect;
    this.onActivate = onActivate;
    this.onMiss = onMiss;
    this.now = now ?? (() => performance.now());
    this.sameTarget = sameTarget ?? ((first, second) => first === second);
    this.downPoint = null;
    this.downPointerId = null;
    this.lastTap = null;
    this.#bind();
  }

  #bind() {
    this.canvas.addEventListener('pointerdown', (event) => {
      this.downPoint = this.#localPoint(event);
      this.downPointerId = event.pointerId;
      this.onMiss();
    });
    this.canvas.addEventListener('pointerup', (event) =>
      this.#onPointerUp(event),
    );
  }

  #localPoint(event) {
    const rect = this.canvas.getBoundingClientRect();
    return [event.clientX - rect.left, event.clientY - rect.top];
  }

  #onPointerUp(event) {
    if (this.downPoint === null || event.pointerId !== this.downPointerId) {
      return;
    }
    const [x, y] = this.#localPoint(event);
    const moved = Math.hypot(x - this.downPoint[0], y - this.downPoint[1]);
    this.downPoint = null;
    if (moved <= TAP_MOVE_PIXELS) {
      this.#onTap(x, y);
    }
  }

  #onTap(x, y) {
    const target = this.pick(x, y);
    if (target === null) {
      this.lastTap = null;
      return;
    }
    const now = this.now();
    const isDoubleTap =
      this.lastTap !== null &&
      this.sameTarget(this.lastTap.target, target) &&
      now - this.lastTap.time < DOUBLE_TAP_MS;
    if (isDoubleTap) {
      this.onActivate(target);
      this.lastTap = null;
    } else {
      this.onSelect(target);
      this.lastTap = { target, time: now };
    }
  }
}
