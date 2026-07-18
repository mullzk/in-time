// Curated facade onto the core services a panel is allowed to touch — camera,
// projection, time, and the decoded schedule — rather than the whole VizCore.
export class PanelContext {
  constructor({ camera, projection, time, engine, tileLayer }) {
    this.camera = camera;
    this.projection = projection;
    this.time = time;
    this.engine = engine;
    this.tileLayer = tileLayer;
  }

  drawTiles(p) {
    this.tileLayer.draw(p, this.camera);
  }
}
