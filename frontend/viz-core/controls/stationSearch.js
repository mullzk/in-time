import { element } from './dom.js';

const INVITED_WIDTH_PIXELS = 380;
const INVITED_MARGIN_PIXELS = 24;

// How far down the ask may travel: the suggestions drop below the field and an
// on-screen keyboard takes the lower half of a phone, so it stays in the upper
// part rather than resting in the middle.
const INVITED_DROP_PIXELS = 200;

// What the suggestions leave standing below themselves, and the least room they
// take even when there is none.
const SUGGESTIONS_FOOT_PIXELS = 12;
const SUGGESTIONS_LEAST_PIXELS = 120;

// Floating search field in the middle of the top bar: the panel supplies the
// StationCatalog, and a chosen station is handed back through onSelect.
export class StationSearch {
  // `stationMayBeGivenUp` says whether this view can stand without a station;
  // where it cannot, neither the button in the field nor the empty commit is
  // offered. `onClear` answers both of them, `onDismiss` answers Escape while
  // the ask stands open.
  constructor(
    container,
    catalog,
    {
      onSelect,
      stationMayBeGivenUp = true,
      onClear = () => {},
      onDismiss = () => {},
    },
  ) {
    this.catalog = catalog;
    this.onSelect = onSelect;
    this.stationMayBeGivenUp = stationMayBeGivenUp;
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

    // A touch screen has no keyboard to give the station up with, so the field
    // carries a button for it.
    this.giveUp = element('button', 'station-search-give-up');
    this.giveUp.type = 'button';
    this.giveUp.textContent = '×';
    this.giveUp.setAttribute('aria-label', 'Auswahl aufheben');
    this.giveUp.addEventListener('click', () => this.#giveUpTheStation());

    this.list = element('ul', 'station-search-suggestions');

    this.prompt = element('p', 'station-search-prompt');
    this.lucky = element('button', 'station-search-lucky');
    this.lucky.type = 'button';
    this.lucky.textContent = 'I feel lucky';

    // Everything the ask shows is measured against the field, never against the
    // card around it: the card makes its room by growing its padding, which
    // takes the length of the transition.
    this.field = element('div', 'station-search-field');
    this.field.append(
      this.prompt,
      this.input,
      this.giveUp,
      this.list,
      this.lucky,
    );

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

  invite(prompt, drawAStation) {
    this.prompt.textContent = prompt;
    this.lucky.onclick = drawAStation;
    this.#placeTheAsk();
    this.root.classList.add('is-inviting');
    this.input.focus();
  }

  endInvitation() {
    this.root.classList.remove('is-inviting');
  }

  // How far the field has to travel to reach the ask, measured rather than
  // assumed, since the bar places the field differently per breakpoint.
  // offsetLeft and offsetTop are read instead of a bounding rectangle because
  // they are the layout position, which the field's own transform does not
  // move -- so a window resized mid-invitation re-aims from where the field
  // would be standing rather than from where it has flown.
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

  // How much screen is left under the open list, measured from where it
  // actually hangs, transform and all, against the visual viewport: with a
  // keyboard open that is the upper half of a phone, which the window's own
  // height knows nothing about. A closed list has no box to measure.
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
    this.#showWhetherAStationIsChosen(true);
    this.#close();
  }

  #showWhetherAStationIsChosen(isChosen) {
    this.root.classList.toggle(
      'is-showing-a-station',
      this.stationMayBeGivenUp && isChosen,
    );
  }

  #giveUpTheStation() {
    this.input.value = '';
    this.#showWhetherAStationIsChosen(false);
    this.#close();
    this.input.blur();
    this.onClear();
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
    } else if (
      event.key === 'Enter' &&
      this.input.value === '' &&
      this.stationMayBeGivenUp
    ) {
      this.#giveUpTheStation();
      event.preventDefault();
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
    this.#showWhetherAStationIsChosen(true);
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
