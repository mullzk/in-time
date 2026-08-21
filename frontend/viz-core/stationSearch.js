import { element } from './dom.js';

// How wide the ask stands, and how much screen it leaves beside it. The field's
// width in the bar is whatever the buttons to its left leave over, which differs
// from view to view -- a view without a sidebar has one button fewer -- so the
// ask takes a width of its own rather than growing out of that one.
const INVITED_WIDTH_PIXELS = 380;
const INVITED_MARGIN_PIXELS = 24;

// How far down the ask may travel. The middle of the screen would be the obvious
// place, but the suggestions drop below the field and an on-screen keyboard
// takes the lower half of a phone, so a card resting in the middle would answer
// into a list nobody can see. It stays in the upper part instead.
const INVITED_DROP_PIXELS = 200;

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

    this.prompt = element('p', 'station-search-prompt');
    this.lucky = element('button', 'station-search-lucky');
    this.lucky.type = 'button';
    this.lucky.textContent = 'I feel lucky';

    // Everything the ask shows is measured against the field, never against the
    // card around it: the card makes its room by growing its padding, which
    // takes the length of the transition, so anything placed against the card
    // would spend that time standing on the field.
    this.field = element('div', 'station-search-field');
    this.field.append(this.prompt, this.input, this.list, this.lucky);

    this.root.appendChild(this.field);
    container.appendChild(this.root);

    document.addEventListener('pointerdown', (event) => {
      if (!this.root.contains(event.target)) {
        this.#close();
      }
    });
    window.addEventListener('resize', () => this.#placeTheAsk());
  }

  focus() {
    this.input.focus();
    this.input.select();
  }

  // A view that cannot draw its picture without a station asks for one on the
  // empty stage: the same field, moved and opened into the ask, so that once it
  // is answered it visibly becomes the search it was all along.
  invite(prompt, drawAStation) {
    this.prompt.textContent = prompt;
    this.lucky.onclick = drawAStation;
    this.#placeTheAsk();
    this.root.classList.add('is-inviting');
  }

  endInvitation() {
    this.root.classList.remove('is-inviting');
  }

  // Where the ask stands and how far the field has to travel to get there,
  // measured rather than assumed: the bar puts the field in the middle of the top
  // row only on the wide layout, and below the narrow breakpoint it sits beside
  // the buttons and under a row of its own. Sideways it lands in the middle of
  // the screen; downwards it stops short of it, see INVITED_DROP_PIXELS.
  // offsetLeft and offsetTop are read instead of a bounding rectangle because
  // they are the layout position, which the field's own transform does not move
  // -- so a window resized mid-invitation re-aims from where it would be standing
  // rather than from where it has flown.
  #placeTheAsk() {
    const width = Math.min(
      INVITED_WIDTH_PIXELS,
      window.innerWidth - 2 * INVITED_MARGIN_PIXELS,
    );
    const bar = this.root.offsetParent.getBoundingClientRect();
    const left = bar.left + this.root.offsetLeft;
    const top = bar.top + this.root.offsetTop;
    this.root.style.setProperty('--invitation-width', `${width}px`);
    this.root.style.setProperty(
      '--invitation-shift-x',
      `${window.innerWidth / 2 - (left + width / 2)}px`,
    );
    const toTheMiddle =
      window.innerHeight / 2 - (top + this.root.offsetHeight / 2);
    this.root.style.setProperty(
      '--invitation-shift-y',
      `${Math.min(toTheMiddle, INVITED_DROP_PIXELS)}px`,
    );
  }

  showSelection(station) {
    this.input.value = station.name;
    this.#close();
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
      // Keep this Escape to the search; without it the same press also reaches
      // the document-level info modal and closes both at once.
      event.stopPropagation();
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
