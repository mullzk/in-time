import { element } from './dom.js';
import { VIEWS, viewAt } from './views.js';

// The gallery as one pill in the control row: every view side by side, the one
// on screen filled in. Plain links, because switching views is a page load --
// they can be opened in a new tab, and the current one is marked rather than
// made clickable to nowhere.
export class ViewSwitcher {
  constructor(container) {
    this.root = element('nav', 'view-switcher');
    this.root.setAttribute('aria-label', 'Ansicht');
    const current = viewAt(window.location.pathname);
    VIEWS.forEach((view) => {
      this.root.appendChild(view === current ? currentView(view) : link(view));
    });
    container.appendChild(this.root);
  }
}

function currentView(view) {
  const marked = element('span', 'view-switcher-view is-current');
  marked.textContent = view.label;
  marked.setAttribute('aria-current', 'page');
  return marked;
}

function link(view) {
  const anchor = element('a', 'view-switcher-view');
  anchor.textContent = view.label;
  anchor.href = view.path + window.location.search;
  return anchor;
}
