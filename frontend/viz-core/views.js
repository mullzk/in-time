// The gallery: every view the application offers, in the order it is shown.
// Each is its own web address, and switching to one is a page load -- a document
// carries one panel until its end, so there is nothing to hand over.
export const VIEWS = [
  { path: '/takt', label: 'Takt' },
  { path: '/reisezeit', label: 'Reisezeit' },
];

const withoutTrailingSlash = (pathname) =>
  pathname.length > 1 && pathname.endsWith('/')
    ? pathname.slice(0, -1)
    : pathname;

export function viewAt(pathname) {
  const path = withoutTrailingSlash(pathname);
  return VIEWS.find((view) => view.path === path) ?? null;
}
