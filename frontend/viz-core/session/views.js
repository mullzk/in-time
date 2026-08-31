// Every view the application offers, in the order it is shown. Each is its own
// web address, and switching to one is a page load.
export const VIEWS = [
  { path: '/takt', label: 'Takt' },
  { path: '/ausbreitung', label: 'Ausbreitung' },
  { path: '/reisezeit', label: 'Reisezeit' },
];

// A view's name is the head of the address; what follows is the station.
export function viewAt(pathname) {
  const [head] = pathname.split('/').filter((segment) => segment !== '');
  return VIEWS.find((view) => view.path === `/${head}`) ?? null;
}
