import { element } from './dom.js';

// What the info tile's card holds: the project described, its keyboard
// shortcuts listed. The content (title, intro, shortcuts) is supplied by the
// caller so the shell stays panel-agnostic. An intro paragraph is a list of
// parts: a string is plain text, an object of label and href becomes a link. It
// owns only its DOM; where it hangs is the dock's business.
export class InfoCard {
  constructor(content) {
    this.root = element('div', 'info-card');

    const title = element('h3', 'info-card-title');
    title.textContent = content.title;
    this.root.appendChild(title);

    content.intro.forEach((paragraph) => {
      this.root.appendChild(this.#paragraph(paragraph));
    });
    this.root.appendChild(this.#shortcutSection(content.shortcuts));
  }

  #paragraph(parts) {
    const text = element('p', 'info-card-intro');
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
    const anchor = element('a', 'info-card-link');
    anchor.textContent = label;
    anchor.href = href;
    anchor.target = '_blank';
    anchor.rel = 'noopener';
    return anchor;
  }

  #shortcutSection(shortcuts) {
    const section = element('section', 'info-card-section');
    const heading = element('h4', 'info-card-heading');
    heading.textContent = 'Tastatur-Shortcuts';
    section.append(heading, this.#shortcuts(shortcuts));
    return section;
  }

  #shortcuts(shortcuts) {
    const list = element('dl', 'info-card-shortcuts');
    shortcuts.forEach(({ keys, description }) => {
      const row = element('div', 'info-card-shortcut');
      const term = element('dt');
      const key = element('kbd', 'info-card-key');
      key.textContent = keys;
      term.appendChild(key);
      const detail = element('dd');
      detail.textContent = description;
      row.append(term, detail);
      list.appendChild(row);
    });
    return list;
  }
}
