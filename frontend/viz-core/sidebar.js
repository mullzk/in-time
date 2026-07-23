const element = (tag, className) => {
  const node = document.createElement(tag);
  if (className) {
    node.className = className;
  }
  return node;
};

// Panel-agnostic control surface on the left: a panel that slides in over the
// map and hosts whatever control sections the active panel supplies. The shell
// owns only the layout and the open/close mechanism; each section's content is
// the panel's. The open state is a class on the container so siblings (the
// cockpit) can shift out of the panel's way with it.
export class Sidebar {
  // `sections` is a list of { title, element }; element is the panel's own
  // control DOM, rendered under a heading.
  constructor(container, sections) {
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
    this.toggleButton.addEventListener('click', () => this.#toggle());

    container.append(this.panel, this.toggleButton);
    this.#setOpen(false);
  }

  #section({ title, element: content }) {
    const section = element('section', 'sidebar-section');
    const heading = element('h2', 'sidebar-heading');
    heading.textContent = title;
    section.append(heading, content);
    return section;
  }

  #toggle() {
    this.#setOpen(!this.open);
  }

  #setOpen(open) {
    this.open = open;
    this.container.classList.toggle('is-sidebar-open', open);
    this.toggleButton.textContent = open ? '✕' : '☰';
    this.toggleButton.setAttribute('aria-expanded', String(open));
  }
}
