// Sidebar sections are mounted by contract, not by position: each one carries a
// stable id and says whether it survives the exhibition mode. The shell may drop
// and reorder them without knowing what is inside.
export function sectionsToMount(sections, { exhibition = false } = {}) {
  const seen = new Set();
  sections.forEach(({ id }) => {
    if (seen.has(id)) {
      throw new Error(`duplicate sidebar section id: ${id}`);
    }
    seen.add(id);
  });
  return exhibition
    ? sections.filter((section) => section.keepInExhibition)
    : sections;
}
