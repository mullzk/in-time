import { element } from './dom.js';

const asColor = ([red, green, blue]) => `rgb(${red} ${green} ${blue})`;

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

  // `accent` is a { ground, text } pair of [r, g, b] colours the label takes on
  // -- a vehicle passes its category's; without one it keeps the surface colour.
  showLines(screenX, screenY, lines, accent = null) {
    this.root.replaceChildren(
      ...lines.map((line) => {
        const row = element('div', 'popover-line');
        row.textContent = line;
        return row;
      }),
    );
    this.#accent(accent);
    this.moveTo(screenX, screenY);
    this.root.classList.add('is-visible');
  }

  // Only the colours come from the script; what the label makes of them is the
  // stylesheet's.
  #accent(accent) {
    if (accent === null) {
      this.root.classList.remove('is-accented');
      return;
    }
    this.root.style.setProperty('--popover-accent', asColor(accent.ground));
    this.root.style.setProperty('--popover-accent-text', asColor(accent.text));
    this.root.classList.add('is-accented');
  }

  moveTo(screenX, screenY) {
    this.root.style.left = `${screenX}px`;
    this.root.style.top = `${screenY}px`;
  }

  hide() {
    this.root.classList.remove('is-visible');
  }
}
