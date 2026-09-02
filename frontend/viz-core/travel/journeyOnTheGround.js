// The journey a tree holds to one station, laid on the ground: the line each
// leg's vehicle really runs, and the stops one changes vehicles at.

export class JourneyOnTheGround {
  // `enginesOfNetworks` are the VehiclePositionEngines the connection list was
  // built from, in the same order.
  constructor(connections, enginesOfNetworks) {
    this.connections = connections;
    this.engines = enginesOfNetworks;
  }

  to(tree, station) {
    const path = tree.pathTo(station);
    return {
      legs: path.map((connection) => this.#legOnTheGround(connection)),
      interchangeStations: this.#interchangeStationsAlong(path),
    };
  }

  #legOnTheGround(connection) {
    const { trip, event } = this.connections.connectionAt(connection);
    return this.engines[this.connections.networkOfTrip(trip)].legPolyline(
      this.connections.tripInNetwork(trip),
      event,
    );
  }

  // One changes vehicles where consecutive legs belong to different trips, and
  // does so where the earlier leg pulls in — which on an interchange need not be
  // the stop the later one sets off from.
  #interchangeStationsAlong(path) {
    return path.flatMap((connection, index) =>
      index > 0 && this.#tripOf(connection) !== this.#tripOf(path[index - 1])
        ? [this.connections.arrivalStations[path[index - 1]]]
        : [],
    );
  }

  #tripOf(connection) {
    return this.connections.trips[connection];
  }
}
