import { element } from './dom.js';

// The map source credit. swisstopo's terms of use require a visible reference
// wherever their raster maps are shown; a null attribution (the black
// background) hides it again.
export class Attribution {
  constructor(container) {
    this.node = element('div', 'attribution');
    this.prefix = document.createTextNode('');
    this.link = element('a', 'attribution-source');
    this.link.target = '_blank';
    this.link.rel = 'noopener';
    this.node.append(this.prefix, this.link);
    container.appendChild(this.node);
    this.set(null);
  }

  set(attribution) {
    if (attribution) {
      this.prefix.textContent = attribution.prefix;
      this.link.textContent = attribution.label;
      this.link.href = attribution.href;
    }
    this.node.classList.toggle('is-visible', Boolean(attribution));
  }
}
