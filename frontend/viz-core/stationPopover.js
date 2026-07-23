import { element } from './dom.js';

// A small floating label (cockpit-styled) anchored above a screen point. It owns
// only its own DOM and does not intercept pointer events, so a click that lands
// on it still reaches the canvas underneath.
export class StationPopover {
  constructor(container) {
    this.root = element('div', 'station-popover');
    this.root.setAttribute('role', 'status');
    container.appendChild(this.root);
    this.hide();
  }

  showAt(screenX, screenY, text) {
    this.root.textContent = text;
    this.root.style.left = `${screenX}px`;
    this.root.style.top = `${screenY}px`;
    this.root.classList.add('is-visible');
  }

  hide() {
    this.root.classList.remove('is-visible');
  }
}
