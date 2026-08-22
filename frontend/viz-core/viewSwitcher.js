import { element } from './dom.js';
import { VIEWS } from './views.js';

// The gallery in the app tile's card: every view under the other, the one on
// screen filled in. It wears the choice list's face but is built of links,
// because switching views is a page load -- they can be opened in a new tab, and
// the current one is marked rather than made clickable to nowhere. Each link
// carries the station on show, so the next view opens on the same place. Where
// the switcher hangs is the caller's: it is handed the DOM rather than mounting
// itself.
export class ViewSwitcher {
  constructor(stationInUrl) {
    this.stationInUrl = stationInUrl;
    this.root = element('nav', 'choice-list');
    this.root.setAttribute('aria-label', 'Ansicht');
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
    const anchor = element('a', 'choice-list-option');
    anchor.textContent = view.label;
    anchor.href = this.stationInUrl.linkTo(view.path);
    return anchor;
  }
}

function currentView(view) {
  const marked = element('span', 'choice-list-option is-current');
  marked.textContent = view.label;
  marked.setAttribute('aria-current', 'page');
  return marked;
}
