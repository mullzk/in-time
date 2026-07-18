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

    context.drawTiles(p);
    context.drawBasemap(p);

    const diameter = 7 / camera.scale;
    p.noStroke();
    engine.activeAt(time.current).forEach((train) => {
      const [r, g, b] = CATEGORY_COLORS[train.category] ?? FALLBACK_COLOR;
      p.fill(r, g, b);
      p.circle(train.east, train.north, diameter);
    });
  }
}
