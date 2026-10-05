// Every view the application offers, in the order it is shown. Each is its own
// web address, and switching to one is a page load. A view that shows the whole
// country at once has no station to name, so it carries none in its address and
// is served by one route rather than two.
export const VIEWS = [
  { path: '/takt', label: 'Takt', carriesStation: true },
  { path: '/kaskade', label: 'Kaskade', carriesStation: true },
  { path: '/zeitkarte', label: 'Zeitkarte', carriesStation: true },
  { path: '/puls', label: 'Puls', carriesStation: false },
];

// A view's name is the head of the address; what follows is the station.
export function viewAt(pathname) {
  const [head] = pathname.split('/').filter((segment) => segment !== '');
  return VIEWS.find((view) => view.path === `/${head}`) ?? null;
}
