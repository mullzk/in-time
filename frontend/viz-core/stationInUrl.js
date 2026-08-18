import { viewAt } from './views.js';

const SEPARATOR = '-';
const OUTSIDE_A_SLUG = /[^\p{Letter}\p{Number}]+/gu;
const LEADING_OR_TRAILING_SEPARATORS = /^-+|-+$/g;
const DIACRITICS = /\p{Diacritic}/gu;

// A name as it reads in the address bar: lower case, words joined by hyphens,
// its umlauts kept ("zürich-hb", "bern-bümpliz-nord"). Everything that is not a
// letter or a digit becomes the separator, so no name can carry a path of its
// own into the address.
export function stationSlug(name) {
  return name
    .toLowerCase()
    .replace(OUTSIDE_A_SLUG, SEPARATOR)
    .replace(LEADING_OR_TRAILING_SEPARATORS, '');
}

// Whoever types an address by hand leaves the umlauts off, so slugs are compared
// with their diacritics folded away.
const comparableSlug = (slug) =>
  stationSlug(slug).normalize('NFD').replace(DIACRITICS, '');

export function stationMatchingSlug(entries, slug) {
  const wanted = comparableSlug(slug);
  if (wanted === '') {
    return null;
  }
  return entries.find((entry) => comparableSlug(entry.name) === wanted) ?? null;
}

// The station a view is showing, kept in the view's own address (/takt/bern):
// what one sees can be linked to, opens again on the same station, and follows
// along when the view is changed. Everything else the address carries -- the
// exhibition mode -- is left untouched.
export class StationInUrl {
  constructor(location = window.location, history = window.history) {
    this.location = location;
    this.history = history;
    this.view = viewAt(location.pathname);
    this.slug = this.#slugInPath();
  }

  // Naming the station is a correction of the address, not a step of its own:
  // going back should leave the view rather than walk through every station
  // that was looked at.
  show(station) {
    if (this.view === null) {
      return;
    }
    this.slug = stationSlug(station.name);
    this.history.replaceState(null, '', this.linkTo(this.view.path));
  }

  linkTo(viewPath) {
    const station =
      this.slug === null ? '' : `/${encodeURIComponent(this.slug)}`;
    return `${viewPath}${station}${this.location.search}`;
  }

  #slugInPath() {
    if (this.view === null) {
      return null;
    }
    const [, station] = this.location.pathname
      .split('/')
      .filter((segment) => segment !== '');
    return station === undefined ? null : decodeURIComponent(station);
  }
}
