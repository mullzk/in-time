// Every view the application offers, in the order it is shown. Each is its own
// web address, and switching to one is a page load.
export const VIEWS = [
  { path: '/taktfahrplan', label: 'Taktfahrplan' },
  { path: '/reisefaecher', label: 'Reisefächer' },
  { path: '/zeitkarte', label: 'Zeitkarte' },
];

// A view's name is the head of the address; what follows is the station.
export function viewAt(pathname) {
  const [head] = pathname.split('/').filter((segment) => segment !== '');
  return VIEWS.find((view) => view.path === `/${head}`) ?? null;
}
