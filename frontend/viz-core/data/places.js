// A place in a picture is an interchange, not a single stop: the platform, the
// bus bay in front of it and the tram stop across the road are one dot with one
// name, so a station is not reached again by every bus around it.

const keyOfStation = (connections, station) =>
  connections.clusterOf(station) ?? connections.didokOf(station);

// The interchange answers to its own didok; only where that stop is not itself
// reached does another member speak for it.
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

// The places a tree reaches, each with the stop that speaks for it and all the
// stops it gathers.
export function placesOfReachedStations(tree, connections, catalog) {
  return [...membersPerPlace(tree, connections, catalog).entries()].map(
    ([key, members]) => ({
      principalStation: principalStopOf(connections, key, members),
      members,
    }),
  );
}
