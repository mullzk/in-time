// The dock, tile by tile: what each one is called, which control sections it
// opens, and whether it wants a wider card. A section belongs to exactly one
// tile, and a tile whose sections the view does not offer is not hung at all.
const TILES = [
  { id: 'play', label: 'Wiedergabe', sections: ['play'] },
  { id: 'sound', label: 'Vertonung', sections: ['sound'] },
  { id: 'elements', label: 'Kategorien', sections: ['layers'] },
  { id: 'map', label: 'Hintergrund', sections: ['background'] },
  { id: 'time', label: 'Zeit', sections: ['tempo', 'clock', 'departure'] },
  { id: 'views', label: 'Ansichten', sections: ['views'] },
  { id: 'info', label: 'Info', sections: ['info'], wideCard: true },
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
