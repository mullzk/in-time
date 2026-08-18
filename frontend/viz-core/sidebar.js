import { element } from './dom.js';

// Panel-agnostic control surface on the left: a panel that slides in over the
// map and hosts whatever control sections the active panel supplies. The shell
// owns only the layout and the open/close mechanism; each section's content is
// the panel's. The open state is a class on the container so siblings (the
// cockpit) can shift out of the panel's way with it.
export class Sidebar {
  // `sections` is a list of { id, title, element, standout } already selected by
  // the shell; element is the section's own control DOM, rendered under a
  // heading. A standout section is set apart from the plain switches above it,
  // for a control that reshapes the whole view rather than toggling one part.
  // The panel slides in over `container`; its button rides in `buttonRow`.
  constructor(container, buttonRow, sections) {
    this.container = container;

    this.panel = element('aside', 'sidebar');
    const body = element('div', 'sidebar-body');
    sections.forEach((section) => {
      body.appendChild(this.#section(section));
    });
    this.panel.appendChild(body);

    this.toggleButton = element('button', 'sidebar-toggle');
    this.toggleButton.type = 'button';
    this.toggleButton.setAttribute('aria-label', 'Ansicht');
    this.toggleButton.addEventListener('click', () => this.toggle());

    container.appendChild(this.panel);
    buttonRow.appendChild(this.toggleButton);
    this.#setOpen(false);
  }

  toggle() {
    this.#setOpen(!this.open);
  }

  #section({ id, title, element: content, standout }) {
    const section = element(
      'section',
      standout ? 'sidebar-section sidebar-section-standout' : 'sidebar-section',
    );
    section.dataset.section = id;
    const heading = element('h2', 'sidebar-heading');
    heading.textContent = title;
    section.append(heading, content);
    return section;
  }

  #setOpen(open) {
    this.open = open;
    this.container.classList.toggle('is-sidebar-open', open);
    this.toggleButton.textContent = open ? '✕' : '☰';
    this.toggleButton.setAttribute('aria-expanded', String(open));
  }
}
