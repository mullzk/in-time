// The dock, tile by tile: what each one is called, which control sections it
// opens, whether it wants a wider card, and whether it works the view in front
// of one or the app around it — the dock sets the two groups apart. A section
// belongs to exactly one tile, and a tile whose sections the view does not offer
// is not hung at all.
const VIEW = 'view';
const APP = 'app';
const TILES = [
  { id: 'play', label: 'Wiedergabe', sections: ['play'], group: VIEW },
  { id: 'sound', label: 'Vertonung', sections: ['sound'], group: VIEW },
  { id: 'elements', label: 'Kategorien', sections: ['layers'], group: VIEW },
  { id: 'map', label: 'Hintergrund', sections: ['background'], group: VIEW },
  {
    id: 'time',
    label: 'Zeit',
    sections: ['tempo', 'clock', 'departure'],
    group: VIEW,
  },
  { id: 'views', label: 'Ansichten', sections: ['views'], group: APP },
  { id: 'info', label: 'Info', sections: ['info'], wideCard: true, group: APP },
];

const homeOf = (sectionId) =>
  TILES.find((tile) => tile.sections.includes(sectionId)) ?? null;

// The sections handed in, grouped into the tiles that carry them, in the dock's
// order and each tile's own. A section no tile carries is refused rather than
// dropped in silence.
export function tilesToHang(sections, { exhibition = false } = {}) {
  const seen = new Set();
  sections.forEach(({ id }) => {
    if (seen.has(id)) {
      throw new Error(`duplicate control section id: ${id}`);
    }
    if (homeOf(id) === null) {
      throw new Error(`control section without a tile: ${id}`);
    }
    seen.add(id);
  });
  const offered = exhibition
    ? sections.filter((section) => section.keepInExhibition)
    : sections;
  return TILES.map((tile) => ({
    ...tile,
    sections: tile.sections.flatMap((sectionId) =>
      offered.filter((section) => section.id === sectionId),
    ),
  })).filter((tile) => tile.sections.length > 0);
}
