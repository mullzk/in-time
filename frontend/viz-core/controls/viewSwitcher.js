import { VIEWS } from '../session/views.js';
import { element } from './dom.js';

// The view gallery in the app tile's card. It wears the choice list's face but
// is built of links, since switching views is a page load; each link carries
// the station on show, so the next view opens on the same place.
export class ViewSwitcher {
  constructor(stationInUrl) {
    this.stationInUrl = stationInUrl;
    this.root = element('nav', 'choice-list');
    this.root.setAttribute('aria-label', 'Ansicht');
    this.refreshLinks();
  }

  // A station is chosen after the links are written, so they are written again
  // whenever the address gains one.
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
