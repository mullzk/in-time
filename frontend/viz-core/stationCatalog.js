const DEFAULT_MAX_SUGGESTIONS = 8;

const RANK_NAME_PREFIX = 0;
const RANK_WORD_START = 1;
const RANK_SUBSTRING = 2;

// Fold case and diacritics and treat "." and "," as spaces, so "st gallen"
// matches "St. Gallen" and "bern bümpliz" matches "Bern, Bümpliz Nord".
export function normalizeForSearch(text) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[.,]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export class StationEntry {
  constructor(didok, name, east, north, modes = [], cluster = null) {
    this.didok = didok;
    this.name = name;
    this.east = east;
    this.north = north;
    this.modes = [...modes];
    // The interchange this stop belongs to (its cluster's representative didok),
    // or null when it stands alone. Stops sharing a cluster are sonified as one.
    this.cluster = cluster;
  }

  addModes(modes) {
    modes.forEach((mode) => {
      if (!this.modes.includes(mode)) {
        this.modes.push(mode);
      }
    });
  }

  adoptCluster(cluster) {
    if (this.cluster === null && cluster != null) {
      this.cluster = cluster;
    }
  }
}

function rankOf(searchKey, query) {
  if (searchKey.startsWith(query)) {
    return RANK_NAME_PREFIX;
  }
  if (searchKey.includes(` ${query}`)) {
    return RANK_WORD_START;
  }
  if (searchKey.includes(query)) {
    return RANK_SUBSTRING;
  }
  return null;
}

export class StationCatalog {
  constructor(entries, { maxSuggestions = DEFAULT_MAX_SUGGESTIONS } = {}) {
    this.maxSuggestions = maxSuggestions;
    this.entries = [];
    this._byDidok = new Map();
    this._indexed = [];
    this.#absorb(entries);
  }

  // Merges a published station set in by didok, unioning the modes each side
  // reports. A didok already present keeps the coordinate it came with, so the
  // rail set added first wins the network node over its bus stop. Sets may
  // arrive at any time -- the road blob is adopted after the first picture.
  addPublished(stations, points) {
    this.#absorb(
      stations.flatMap((station, index) => {
        const point = points[index];
        return point
          ? [
              new StationEntry(
                station.didok,
                station.name,
                point[0],
                point[1],
                station.modes ?? [],
                station.cluster ?? null,
              ),
            ]
          : [];
      }),
    );
  }

  #absorb(entries) {
    entries.forEach((entry) => {
      const existing = this._byDidok.get(entry.didok);
      if (existing === undefined) {
        this._byDidok.set(entry.didok, entry);
        this.entries.push(entry);
        this._indexed.push({
          entry,
          searchKey: normalizeForSearch(entry.name),
        });
      } else {
        existing.addModes(entry.modes);
        existing.adoptCluster(entry.cluster);
      }
    });
  }

  matching(query) {
    const normalized = normalizeForSearch(query);
    if (normalized === '') {
      return [];
    }
    return this._indexed
      .map(({ entry, searchKey }) => ({
        entry,
        rank: rankOf(searchKey, normalized),
      }))
      .filter((scored) => scored.rank !== null)
      .sort(
        (first, second) =>
          first.rank - second.rank ||
          first.entry.name.length - second.entry.name.length ||
          first.entry.name.localeCompare(second.entry.name),
      )
      .slice(0, this.maxSuggestions)
      .map((scored) => scored.entry);
  }
}
