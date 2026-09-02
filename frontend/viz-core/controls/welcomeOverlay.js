import { iconNamed } from './dockIcons.js';
import { element } from './dom.js';

const TITLE_ID = 'welcome-title';

// The welcome that stands over the picture on a first visit: what is worth
// finding in the dock, each hint shown as the tile it is, and one button to get
// on with it. It holds the keyboard while it stands, so the shortcuts behind it
// stay out of reach.
export class WelcomeOverlay {
  constructor(container, content, { onDismiss }) {
    this.onDismiss = onDismiss;
    this.isOpen = false;
    this.root = element('div', 'welcome');
    this.root.hidden = true;
    this.root.appendChild(this.#card(content));
    this.root.addEventListener('click', (event) => {
      if (event.target === this.root) {
        this.close();
      }
    });
    this.root.addEventListener('keydown', (event) => {
      event.stopPropagation();
      if (event.key === 'Escape') {
        this.close();
      }
    });
    container.appendChild(this.root);
  }

  show() {
    this.isOpen = true;
    this.root.hidden = false;
    this.dismissButton.focus();
  }

  close() {
    if (!this.isOpen) {
      return;
    }
    this.isOpen = false;
    this.root.hidden = true;
    this.onDismiss();
  }

  #card({ title, lead, place, hints, dismissLabel }) {
    const card = element('div', 'welcome-card');
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-modal', 'true');
    card.setAttribute('aria-labelledby', TITLE_ID);

    const heading = element('h2', 'welcome-title');
    heading.id = TITLE_ID;
    heading.textContent = title;

    const leadText = element('p', 'welcome-lead');
    leadText.textContent = lead;

    this.dismissButton = element('button', 'welcome-dismiss control-button');
    this.dismissButton.type = 'button';
    this.dismissButton.textContent = dismissLabel;
    this.dismissButton.addEventListener('click', () => this.close());

    card.append(
      heading,
      leadText,
      this.#place(place),
      this.#hints(hints),
      this.dismissButton,
    );
    return card;
  }

  // Where the dock stands differs between the layouts, so both sentences are
  // written and the stylesheet shows the one that holds.
  #place({ wide, narrow }) {
    const sentence = element('p', 'welcome-place');
    const forWide = element('span', 'welcome-place-wide');
    forWide.textContent = wide;
    const forNarrow = element('span', 'welcome-place-narrow');
    forNarrow.textContent = narrow;
    sentence.append(forWide, forNarrow);
    return sentence;
  }

  #hints(hints) {
    const list = element('ul', 'welcome-hints');
    hints.forEach((hint) => {
      list.appendChild(this.#hint(hint));
    });
    return list;
  }

  #hint({ tile, title, text }) {
    const item = element('li', 'welcome-hint');

    // The tile itself, not a picture of one, so what is promised here is what
    // the dock shows. It is a span rather than a button: nothing to press.
    const shownTile = element('span', 'dock-tile-button');
    shownTile.appendChild(iconNamed(tile));

    const heading = element('h3', 'welcome-hint-title');
    heading.textContent = title;
    const description = element('p', 'welcome-hint-text');
    description.textContent = text;
    const words = element('div', 'welcome-hint-words');
    words.append(heading, description);

    item.append(shownTile, words);
    return item;
  }
}

// The stand-in for a view that welcomes nobody, so the shell need not ask
// whether there is a welcome before it goes on.
export class NoWelcome {
  isOpen = false;

  show() {}
}
