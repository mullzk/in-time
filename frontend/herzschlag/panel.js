import { Panel } from '../viz-core/panel.js';
import { VehiclePositionEngine } from '../viz-core/vehiclePositionEngine.js';

// Colours by blob category: rail 0-4 (Fernverkehr, IR, Regio/RE, S-Bahn, other),
// tram 5, bus 6.
const CATEGORY_COLORS = [
  [240, 90, 70],
  [240, 160, 60],
  [90, 200, 120],
  [90, 170, 240],
  [180, 180, 190],
  [210, 100, 210],
  [240, 205, 70],
];
const FALLBACK_COLOR = [200, 200, 200];

export class HerzschlagPanel extends Panel {
  capabilities = { transport: true, fullDayScrubber: true };

  constructor(railBuffer, roadBuffer) {
    super();
    this.railBuffer = railBuffer;
    this.roadBuffer = roadBuffer;
    this.activeVehicles = [];
  }

  init() {
    this.engines = [
      new VehiclePositionEngine(this.railBuffer),
      new VehiclePositionEngine(this.roadBuffer),
    ];
  }

  update(currentTimeSeconds, _deltaSeconds) {
    this.activeVehicles = this.engines.flatMap((engine) =>
      engine.activeAt(currentTimeSeconds),
    );
  }

  drawWorld(p, context) {
    context.drawTiles(p);
    this.engines.forEach((engine) => {
      context.drawBasemap(p, engine.edges);
    });

    const diameter = 7 / context.camera.scale;
    p.noStroke();
    this.activeVehicles.forEach((vehicle) => {
      const [r, g, b] = CATEGORY_COLORS[vehicle.category] ?? FALLBACK_COLOR;
      p.fill(r, g, b);
      p.circle(vehicle.east, vehicle.north, diameter);
    });
  }
}
