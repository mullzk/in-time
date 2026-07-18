import { Panel } from '../viz-core/panel.js';

// Rail categories 0-4 from the blob (Fernverkehr, IR, Regio/RE, S-Bahn, other).
const CATEGORY_COLORS = [
  [240, 90, 70],
  [240, 160, 60],
  [90, 200, 120],
  [90, 170, 240],
  [180, 180, 190],
];
const FALLBACK_COLOR = [200, 200, 200];

export class HerzschlagPanel extends Panel {
  capabilities = { transport: true, fullDayScrubber: true };

  drawWorld(p, context) {
    const { camera, engine, time } = context;
    const worldPerPixel = 1 / camera.scale;

    context.drawTiles(p);

    p.noFill();
    p.stroke(90, 100, 115);
    p.strokeWeight(1.1 * worldPerPixel);
    engine.edges.forEach((polyline) => {
      p.beginShape();
      polyline.forEach(([east, north]) => {
        p.vertex(east, north);
      });
      p.endShape();
    });

    const diameter = 7 * worldPerPixel;
    p.noStroke();
    engine.activeAt(time.current).forEach((train) => {
      const [r, g, b] = CATEGORY_COLORS[train.category] ?? FALLBACK_COLOR;
      p.fill(r, g, b);
      p.circle(train.east, train.north, diameter);
    });
  }
}
