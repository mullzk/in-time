import { element } from './dom.js';

// Floating search field (top centre, cockpit-styled): the panel supplies the
// StationCatalog, and a chosen station is handed back through onSelect so the
// caller can move the camera. It owns only its DOM and selection state.
export class StationSearch {
  constructor(container, catalog, { onSelect }) {
    this.catalog = catalog;
    this.onSelect = onSelect;
    this.suggestions = [];
    this.activeIndex = -1;

    this.root = element('div', 'station-search');

    this.input = element('input', 'station-search-input');
    this.input.type = 'text';
    this.input.placeholder = 'Station suchen …';
    this.input.setAttribute('aria-label', 'Station suchen');
    this.input.addEventListener('input', () => this.#refresh());
    this.input.addEventListener('keydown', (event) => this.#onKeyDown(event));

    this.list = element('ul', 'station-search-suggestions');

    this.root.append(this.input, this.list);
    container.appendChild(this.root);

    document.addEventListener('pointerdown', (event) => {
      if (!this.root.contains(event.target)) {
        this.#close();
      }
    });
  }

  focus() {
    this.input.focus();
    this.input.select();
  }

  #refresh() {
    this.suggestions = this.catalog.matching(this.input.value);
    this.activeIndex = this.suggestions.length > 0 ? 0 : -1;
    this.#render();
  }

  #render() {
    this.list.replaceChildren(
      ...this.suggestions.map((station, index) => {
        const item = element('li', 'station-search-suggestion');
        if (index === this.activeIndex) {
          item.classList.add('is-active');
        }
        item.textContent = station.name;
        item.addEventListener('pointerdown', (event) => {
          event.preventDefault();
          this.#choose(index);
        });
        return item;
      }),
    );
    this.root.classList.toggle('is-open', this.suggestions.length > 0);
  }

  #onKeyDown(event) {
    if (event.key === 'ArrowDown') {
      this.#moveActive(1);
      event.preventDefault();
    } else if (event.key === 'ArrowUp') {
      this.#moveActive(-1);
      event.preventDefault();
    } else if (event.key === 'Enter' && this.activeIndex >= 0) {
      this.#choose(this.activeIndex);
      event.preventDefault();
    } else if (event.key === 'Escape') {
      this.#close();
      this.input.blur();
    }
  }

  #moveActive(delta) {
    const count = this.suggestions.length;
    if (count === 0) {
      return;
    }
    this.activeIndex = (this.activeIndex + delta + count) % count;
    this.#render();
  }

  #choose(index) {
    const station = this.suggestions[index];
    this.onSelect(station);
    this.input.value = station.name;
    this.#close();
    this.input.blur();
  }

  #close() {
    this.suggestions = [];
    this.activeIndex = -1;
    this.list.replaceChildren();
    this.root.classList.remove('is-open');
  }
}
