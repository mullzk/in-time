// The gallery: every view the application offers, in the order it is shown.
// Each is its own web address, and switching to one is a page load -- a document
// carries one panel until its end, so there is nothing to hand over.
export const VIEWS = [
  { path: '/takt', label: 'Takt' },
  { path: '/ausbreitung', label: 'Ausbreitung' },
  { path: '/reisezeit', label: 'Reisezeit' },
];

// A view keeps its own name at the head of the address; what follows it is the
// station it opens on, which says nothing about which view this is.
export function viewAt(pathname) {
  const [head] = pathname.split('/').filter((segment) => segment !== '');
  return VIEWS.find((view) => view.path === `/${head}`) ?? null;
}
