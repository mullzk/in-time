import { element } from './dom.js';
import { VIEWS } from './views.js';

// The gallery as one pill in the control row: every view side by side, the one
// on screen filled in. Plain links, because switching views is a page load --
// they can be opened in a new tab, and the current one is marked rather than
// made clickable to nowhere. Each link carries the station on show, so the next
// view opens on the same place.
export class ViewSwitcher {
  constructor(container, stationInUrl) {
    this.stationInUrl = stationInUrl;
    this.root = element('nav', 'view-switcher');
    this.root.setAttribute('aria-label', 'Ansicht');
    container.appendChild(this.root);
    this.refreshLinks();
  }

  // A station is chosen long after the links are written, so they are written
  // again whenever the address gains one.
  refreshLinks() {
    this.root.replaceChildren(
      ...VIEWS.map((view) =>
        view === this.stationInUrl.view ? currentView(view) : this.#link(view),
      ),
    );
  }

  #link(view) {
    const anchor = element('a', 'view-switcher-view');
    anchor.textContent = view.label;
    anchor.href = this.stationInUrl.linkTo(view.path);
    return anchor;
  }
}

function currentView(view) {
  const marked = element('span', 'view-switcher-view is-current');
  marked.textContent = view.label;
  marked.setAttribute('aria-current', 'page');
  return marked;
}
