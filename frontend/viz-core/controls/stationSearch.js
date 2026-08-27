import { element } from './dom.js';

// How wide the ask stands, and how much screen it leaves beside it. The field in
// the bar is capped narrower than that, so the ask takes a width of its own
// rather than growing out of the field's.
const INVITED_WIDTH_PIXELS = 380;
const INVITED_MARGIN_PIXELS = 24;

// How far down the ask may travel. The middle of the screen would be the obvious
// place, but the suggestions drop below the field and an on-screen keyboard
// takes the lower half of a phone, so a card resting in the middle would answer
// into a list nobody can see. It stays in the upper part instead.
const INVITED_DROP_PIXELS = 200;

// What the suggestions leave standing below themselves, and the least room they
// take even when there is none: a list squeezed to a single line is worse to
// answer than one that overlaps the very foot of the screen.
const SUGGESTIONS_FOOT_PIXELS = 12;
const SUGGESTIONS_LEAST_PIXELS = 120;

// Floating search field in the middle of the top bar: the panel supplies the
// StationCatalog, and a chosen station is handed back through onSelect so the
// caller can move the camera. It owns only its DOM and selection state.
export class StationSearch {
  // `onClear` answers an empty field committed with Enter -- the way to say that
  // no station is chosen any more. A view that cannot do without one passes a
  // handler that does nothing. `onDismiss` answers Escape while the ask stands
  // open: not a station given up, but the ask itself turned down.
  constructor(
    container,
    catalog,
    { onSelect, onClear = () => {}, onDismiss = () => {} },
  ) {
    this.catalog = catalog;
    this.onSelect = onSelect;
    this.onClear = onClear;
    this.onDismiss = onDismiss;
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
    // The keyboard opening does not resize the window on iOS, only the part of
    // it left to see, and the list has to be held to that part.
    window.visualViewport?.addEventListener('resize', () =>
      this.#capTheSuggestions(),
    );
    window.visualViewport?.addEventListener('scroll', () =>
      this.#capTheSuggestions(),
    );
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
    // The ask is the only thing on the stage and there is one way to answer it,
    // so the field takes the caret rather than waiting to be clicked.
    this.input.focus();
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
    this.#capTheSuggestions();
  }

  // How much screen is left under the open list for it to fill. It is measured
  // from where it actually hangs, transform and all, against the part of the
  // window that is still to be seen: with a keyboard open that is the upper half
  // of a phone, which the window's own height knows nothing about. A closed list
  // has no box to measure and none to fill; it is capped as it opens.
  #capTheSuggestions() {
    if (!this.root.classList.contains('is-open')) {
      return;
    }
    const seen = window.visualViewport;
    const foot = seen ? seen.offsetTop + seen.height : window.innerHeight;
    const room =
      foot - this.list.getBoundingClientRect().top - SUGGESTIONS_FOOT_PIXELS;
    this.root.style.setProperty(
      '--suggestions-height',
      `${Math.max(room, SUGGESTIONS_LEAST_PIXELS)}px`,
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
    this.#capTheSuggestions();
    // The list scrolls once it is longer than the room under the field, so the
    // arrow keys have to carry the view along with the choice they move.
    this.list
      .querySelector('.station-search-suggestion.is-active')
      ?.scrollIntoView({ block: 'nearest' });
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
    } else if (event.key === 'Enter' && this.input.value === '') {
      // Emptying the field and committing it is how a station is given up: the
      // field is what shows which one is chosen, so an empty one shows none.
      this.onClear();
      event.preventDefault();
      this.input.blur();
    } else if (event.key === 'Escape') {
      // Keep this Escape to the search; without it the same press also reaches
      // the document-level info modal and closes both at once.
      event.stopPropagation();
      this.#close();
      this.input.blur();
      if (this.root.classList.contains('is-inviting')) {
        this.onDismiss();
      }
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
