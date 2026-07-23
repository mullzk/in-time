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
  constructor(didok, name, east, north) {
    this.didok = didok;
    this.name = name;
    this.east = east;
    this.north = north;
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
    this.entries = entries;
    this._indexed = entries.map((entry) => ({
      entry,
      searchKey: normalizeForSearch(entry.name),
    }));
  }

  // Merge the rail/tram and bus station sets by didok; a station present in both
  // keeps its rail coordinate (the network node) and falls back to the bus stop.
  static fromPublished(bavNames, bavPoints, roadNames, roadPoints) {
    const byDidok = new Map();
    const absorb = (names, points) => {
      names.forEach((station, index) => {
        const point = points[index];
        if (!point || byDidok.has(station.didok)) {
          return;
        }
        byDidok.set(
          station.didok,
          new StationEntry(station.didok, station.name, point[0], point[1]),
        );
      });
    };
    absorb(bavNames, bavPoints);
    absorb(roadNames, roadPoints);
    return new StationCatalog([...byDidok.values()]);
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
