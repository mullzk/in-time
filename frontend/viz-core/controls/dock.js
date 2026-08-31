import { iconNamed } from './dockIcons.js';
import { element } from './dom.js';

// The control surface at the left edge: one tile per group of controls, only
// one card open at a time. A tile may instead be pressed directly (play), in
// which case it wears the face of what pressing it will do next. The shell owns
// what is in a card; the dock owns the tiles, the naming and the opening.
export class Dock {
  constructor(container, tiles) {
    this.root = element('nav', 'dock');
    this.root.setAttribute('aria-label', 'Bedienung');
    this.openTile = null;
    this.tiles = tiles.map((tile) => this.#tile(tile));
    this.root.append(...this.tiles.map(({ root }) => root));
    container.appendChild(this.root);

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

  toggle(tileId) {
    const tile = this.tiles.find((candidate) => candidate.id === tileId);
    this.#open(this.openTile === tile ? null : tile);
  }

  // Called every frame, so an unchanged face is left alone.
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
      root.appendChild(this.#card(sections, { label, wideCard }));
      button.addEventListener('click', () => this.toggle(id));
    } else {
      button.addEventListener('click', () => {
        this.close();
        pressed.onActivate();
      });
    }
    return tile;
  }

  #card(sections, { label, wideCard }) {
    const card = element('div', 'dock-card');
    if (wideCard) {
      card.classList.add('dock-card-wide');
    }
    const saysNoMoreThanTheTile = (section) =>
      sections.length === 1 && section.title === label;
    sections.forEach((section) => {
      card.appendChild(this.#section(section, !saysNoMoreThanTheTile(section)));
    });
    return card;
  }

  #section({ id, title, element: content }, headed) {
    const section = element('section', 'dock-card-section');
    section.dataset.section = id;
    if (headed) {
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
