import { element } from './dom.js';

// A small floating label (cockpit-styled) anchored above a screen point. It owns
// only its own DOM and does not intercept pointer events, so a click that lands
// on it still reaches the canvas underneath. A single line names a station; a
// vehicle passes several lines (category and route) and is repositioned each
// frame through moveTo as it travels.
export class Popover {
  constructor(container, modifierClass = null) {
    this.root = element('div', 'popover');
    if (modifierClass !== null) {
      this.root.classList.add(modifierClass);
    }
    this.root.setAttribute('role', 'status');
    container.appendChild(this.root);
    this.hide();
  }

  showAt(screenX, screenY, text) {
    this.showLines(screenX, screenY, [text]);
  }

  showLines(screenX, screenY, lines) {
    this.root.replaceChildren(
      ...lines.map((line) => {
        const row = element('div', 'popover-line');
        row.textContent = line;
        return row;
      }),
    );
    this.moveTo(screenX, screenY);
    this.root.classList.add('is-visible');
  }

  moveTo(screenX, screenY) {
    this.root.style.left = `${screenX}px`;
    this.root.style.top = `${screenY}px`;
  }

  hide() {
    this.root.classList.remove('is-visible');
  }
}
