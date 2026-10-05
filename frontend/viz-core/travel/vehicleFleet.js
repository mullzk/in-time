/**
 * The networks a view shows vehicles from: one per schedule blob, each with the
 * engine that positions its trips and the published stations those trips index
 * into. A trip index means something only inside its own network, so a vehicle
 * carries the index of the network it belongs to.
 */
import { categoryLabel } from '../data/transportCategories.js';
import { VehiclePositionEngine } from './vehiclePositionEngine.js';

export class VehicleFleet {
  constructor() {
    this.networks = [];
  }

  // Returns the engine, whose trips, edges and station points the caller reads.
  add(buffer, stations) {
    const engine = new VehiclePositionEngine(buffer);
    this.networks.push({ engine, trips: engine.trips, stations });
    return engine;
  }

  engines() {
    return this.networks.map(({ engine }) => engine);
  }

  activeAt(seconds) {
    return this.networks.flatMap(({ engine }, networkIndex) =>
      engine.activeAt(seconds).map((vehicle) => {
        vehicle.networkIndex = networkIndex;
        return vehicle;
      }),
    );
  }

  describe({ networkIndex, tripIndex, category }) {
    const { engine, stations } = this.networks[networkIndex];
    const { originStation, destinationStation } =
      engine.tripEndpoints(tripIndex);
    return {
      label: categoryLabel(category),
      category,
      origin: stations[originStation]?.name,
      destination: stations[destinationStation]?.name,
    };
  }

  positionOf({ networkIndex, tripIndex }, seconds) {
    return this.networks[networkIndex].engine.positionAt(tripIndex, seconds);
  }

  trailPositions(
    { networkIndex, tripIndex },
    seconds,
    sampleCount,
    spacingSeconds,
  ) {
    return this.networks[networkIndex].engine.trailPositions(
      tripIndex,
      seconds,
      sampleCount,
      spacingSeconds,
    );
  }
}
