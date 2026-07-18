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

  // The rail-only public-transport basemap: the network as static vector
  // strokes, a shared substrate panels compose rather than redraw themselves.
  drawBasemap(p) {
    p.noFill();
    p.stroke(90, 100, 115);
    p.strokeWeight(1.1 / this.camera.scale);
    this.engine.edges.forEach((polyline) => {
      p.beginShape();
      polyline.forEach(([east, north]) => {
        p.vertex(east, north);
      });
      p.endShape();
    });
  }
}
