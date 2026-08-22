import { iconNamed } from './dockIcons.js';
import { element } from './dom.js';

// The control surface at the left edge: one tile per group of controls, hovered
// to learn its name, clicked to open the card that holds them. Only one card
// stands open, so the picture is never covered by more than the one thing being
// looked at. Nearly every tile is of the same kind, the info text included; the
// exception is a tile whose one control is the press itself -- play, which stops
// and starts the picture where it stands and wears the face of what pressing it
// will do next. The shell owns what is in a card; the dock owns only the tiles,
// the naming and the opening.
export class Dock {
  constructor(container, tiles) {
    this.root = element('nav', 'dock');
    this.root.setAttribute('aria-label', 'Bedienung');
    this.openTile = null;
    this.tiles = tiles.map((tile) => this.#tile(tile));
    this.root.append(...this.tiles.map(({ root }) => root));
    container.appendChild(this.root);

    // A card is closed by anything that is not it: the next tile, the picture
    // behind it, or Escape.
    document.addEventListener('pointerdown', (event) => {
      if (!this.root.contains(event.target)) {
        this.close();
      }
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && this.openTile !== null) {
        event.stopPropagation();
        this.close();
      }
    });
  }

  close() {
    this.#open(null);
  }

  // A tile may also be reached by its key rather than by its face.
  toggle(tileId) {
    const tile = this.tiles.find((candidate) => candidate.id === tileId);
    this.#open(this.openTile === tile ? null : tile);
  }

  // Shows the current face of every tile that answers a press directly: what
  // pressing it will do now. Unchanged faces are left alone, since this is asked
  // on every frame.
  showFaces() {
    this.tiles.forEach((tile) => {
      const face = tile.face?.();
      if (face === undefined || face.icon === tile.wearing) {
        return;
      }
      tile.wearing = face.icon;
      tile.button.replaceChildren(iconNamed(face.icon));
      tile.button.setAttribute('aria-label', face.label);
      tile.name.textContent = face.label;
    });
  }

  #tile({ id, label, sections, wideCard = false }) {
    const root = element('div', 'dock-tile');
    root.dataset.tile = id;

    const button = element('button', 'dock-tile-button');
    button.type = 'button';
    button.setAttribute('aria-label', label);
    button.appendChild(iconNamed(id));

    const name = element('span', 'dock-tile-name');
    name.textContent = label;
    root.append(button, name);

    const pressed = sections.find((section) => section.onActivate) ?? null;
    const tile = { id, root, button, name, face: pressed?.face, wearing: id };
    if (pressed === null) {
      root.appendChild(this.#card(sections, wideCard));
      button.addEventListener('click', () => this.toggle(id));
    } else {
      button.addEventListener('click', () => {
        this.close();
        pressed.onActivate();
      });
    }
    return tile;
  }

  #card(sections, wideCard) {
    const card = element('div', 'dock-card');
    if (wideCard) {
      card.classList.add('dock-card-wide');
    }
    sections.forEach((section) => {
      card.appendChild(this.#section(section, sections.length === 1));
    });
    return card;
  }

  // A card with one section needs no heading over it: the tile's name already
  // says what is being set. Several sections in one card do.
  #section({ id, title, element: content }, alone) {
    const section = element('section', 'dock-card-section');
    section.dataset.section = id;
    if (!alone) {
      const heading = element('h2', 'dock-card-heading');
      heading.textContent = title;
      section.appendChild(heading);
    }
    section.appendChild(content);
    return section;
  }

  #open(tile) {
    this.openTile = tile;
    this.tiles.forEach((candidate) => {
      const open = candidate === tile;
      candidate.root.classList.toggle('is-open', open);
      candidate.button.setAttribute('aria-expanded', String(open));
    });
  }
}
