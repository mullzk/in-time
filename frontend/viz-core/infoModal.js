import { element } from './dom.js';

const TITLE_ID = 'info-modal-title';

// A centred overlay describing the project and its controls, with its own toggle
// button placed next to the sidebar's. The content (title, intro, control help,
// keyboard shortcuts) is supplied by the caller so the shell stays panel-
// agnostic. An intro paragraph is a list of parts: a string is plain text, an
// object of label and href becomes a link. The open state lives as `is-open` on
// the overlay; a click on the backdrop or Escape closes it.
export class InfoModal {
  constructor(container, content) {
    this.isOpen = false;
    // The key that opens the dialog is the key that closes it, so it belongs to
    // the dialog and stays in effect while everything else falls silent.
    this.bindings = { i: () => this.toggle() };

    this.toggleButton = element('button', 'info-toggle');
    this.toggleButton.type = 'button';
    this.toggleButton.textContent = 'ⓘ';
    this.toggleButton.setAttribute('aria-label', `Über ${content.title}`);
    this.toggleButton.addEventListener('click', () => this.toggle());

    this.overlay = element('div', 'info-modal');
    this.overlay.setAttribute('role', 'dialog');
    this.overlay.setAttribute('aria-modal', 'true');
    this.overlay.setAttribute('aria-labelledby', TITLE_ID);
    this.overlay.appendChild(this.#dialog(content));
    this.overlay.addEventListener('pointerdown', (event) => {
      if (event.target === this.overlay) {
        this.close();
      }
    });

    container.append(this.toggleButton, this.overlay);
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && this.isOpen) {
        this.close();
      }
    });
    this.#setOpen(false);
  }

  toggle() {
    this.#setOpen(!this.isOpen);
  }

  close() {
    this.#setOpen(false);
  }

  #dialog(content) {
    const dialog = element('div', 'info-modal-dialog');

    const close = element('button', 'info-modal-close');
    close.type = 'button';
    close.textContent = '✕';
    close.setAttribute('aria-label', 'Schließen');
    close.addEventListener('click', () => this.close());

    const title = element('h2', 'info-modal-title');
    title.id = TITLE_ID;
    title.textContent = content.title;

    dialog.append(close, title);
    content.intro.forEach((paragraph) => {
      dialog.appendChild(this.#paragraph(paragraph));
    });
    dialog.appendChild(this.#controls(content));
    return dialog;
  }

  #paragraph(parts) {
    const text = element('p', 'info-modal-intro');
    parts.forEach((part) => {
      text.appendChild(
        typeof part === 'string'
          ? document.createTextNode(part)
          : this.#link(part),
      );
    });
    return text;
  }

  // The links leave the app, so they open in a new tab: a running visualisation
  // is a place the user should not lose by reading its credits.
  #link({ label, href }) {
    const anchor = element('a', 'info-modal-link');
    anchor.textContent = label;
    anchor.href = href;
    anchor.target = '_blank';
    anchor.rel = 'noopener';
    return anchor;
  }

  #controls(content) {
    const section = element('section', 'info-modal-section');

    const heading = element('h3', 'info-modal-heading');
    heading.textContent = 'Hilfe zur Steuerung';

    const help = element('p', 'info-modal-intro');
    help.textContent = content.controlHelp;

    const shortcutsHeading = element('h4', 'info-modal-subheading');
    shortcutsHeading.textContent = 'Tastatur-Shortcuts';

    section.append(
      heading,
      help,
      shortcutsHeading,
      this.#shortcuts(content.shortcuts),
    );
    return section;
  }

  #shortcuts(shortcuts) {
    const list = element('dl', 'info-modal-shortcuts');
    shortcuts.forEach(({ keys, description }) => {
      const row = element('div', 'info-modal-shortcut');
      const term = element('dt');
      const key = element('kbd', 'info-modal-key');
      key.textContent = keys;
      term.appendChild(key);
      const detail = element('dd');
      detail.textContent = description;
      row.append(term, detail);
      list.appendChild(row);
    });
    return list;
  }

  #setOpen(open) {
    this.isOpen = open;
    this.overlay.classList.toggle('is-open', open);
    this.toggleButton.setAttribute('aria-expanded', String(open));
  }
}
