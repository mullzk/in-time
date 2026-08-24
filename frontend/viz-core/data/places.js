// A place in a picture is not a stop but an interchange: the platform, the bus
// bay in front of it and the tram stop across the road are one dot with one
// name. Without that, a station reached by train would be reached again by every
// bus around it -- once as a light in the spread, once as a line of its own in
// the travel-time picture.

const keyOfStation = (connections, station) =>
  connections.clusterOf(station) ?? connections.didokOf(station);

// The interchange answers to its own name -- the didok the catalog names it by.
// Only where that stop is not itself reached does another member speak for it.
const principalStopOf = (connections, key, members) => {
  const principal = connections.stationOf(key);
  return principal !== undefined && members.includes(principal)
    ? principal
    : members[0];
};

const membersPerPlace = (tree, connections, catalog) => {
  const members = new Map();
  tree
    .reachedStations()
    .filter((station) => catalog.entryOf(connections.didokOf(station)) !== null)
    .forEach((station) => {
      const key = keyOfStation(connections, station);
      members.set(key, [...(members.get(key) ?? []), station]);
    });
  return members;
};

// The places a tree reaches: each with the stop that speaks for it and all the
// stops it gathers, so a panel can ask both what to call it and how one got in.
export function placesOfReachedStations(tree, connections, catalog) {
  return [...membersPerPlace(tree, connections, catalog).entries()].map(
    ([key, members]) => ({
      principalStation: principalStopOf(connections, key, members),
      members,
    }),
  );
}
