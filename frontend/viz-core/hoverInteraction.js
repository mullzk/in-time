// Turns mouse movement over the canvas into a hovered target: as the pointer
// moves it picks whatever lies under it and reports the change through onHover,
// passing null when nothing is hit or the pointer leaves. Mouse only -- touch
// has no hover -- and quiet while a button is held so it never fires during a
// camera drag. It reports only when the hovered target changes, so a still or
// repeating pointer costs nothing downstream. Picks must be stable objects, so a
// station lingered over stays the same target rather than re-firing every move.
export class HoverInteraction {
  constructor(canvasElement, { pick, onHover }) {
    this.canvas = canvasElement;
    this.pick = pick;
    this.onHover = onHover;
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
    if (target === this.hovered) {
      return;
    }
    this.hovered = target;
    this.onHover(target);
  }
}
