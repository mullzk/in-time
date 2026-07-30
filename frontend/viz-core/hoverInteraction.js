// Turns mouse movement over the canvas into a hovered target: as the pointer
// moves it picks whatever lies under it and reports the change through onHover,
// passing null when nothing is hit or the pointer leaves. Mouse only -- touch
// has no hover -- and quiet while a button is held so it never fires during a
// camera drag. sameTarget(a, b) decides when two picks are the same target, so a
// vehicle rebuilt each frame is not reported as a fresh hover on every move; only
// a real change reaches onHover.
export class HoverInteraction {
  constructor(canvasElement, { pick, onHover, sameTarget }) {
    this.canvas = canvasElement;
    this.pick = pick;
    this.onHover = onHover;
    this.sameTarget = sameTarget ?? ((first, second) => first === second);
    this.hovered = null;
    this.#bind();
  }

  #bind() {
    this.canvas.addEventListener('pointermove', (event) => this.#onMove(event));
    this.canvas.addEventListener('pointerleave', () => this.#update(null));
  }

  #onMove(event) {
    if (event.pointerType !== 'mouse' || event.buttons !== 0) {
      return;
    }
    const [x, y] = this.#localPoint(event);
    this.#update(this.pick(x, y));
  }

  #localPoint(event) {
    const rect = this.canvas.getBoundingClientRect();
    return [event.clientX - rect.left, event.clientY - rect.top];
  }

  #update(target) {
    if (this.#isSame(target, this.hovered)) {
      return;
    }
    this.hovered = target;
    this.onHover(target);
  }

  #isSame(first, second) {
    if (first === second) {
      return true;
    }
    if (first === null || second === null) {
      return false;
    }
    return this.sameTarget(first, second);
  }
}
