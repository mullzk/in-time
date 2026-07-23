// Curated facade onto the core services a panel is allowed to touch — camera,
// projection, time, and the drawing helpers — rather than the whole VizCore.
// Panel-specific state (its VehiclePositionEngine) lives in the panel, not here.
export class PanelContext {
  constructor({ camera, projection, time, tileLayer }) {
    this.camera = camera;
    this.projection = projection;
    this.time = time;
    this.tileLayer = tileLayer;
    this.tilesVisible = true;
  }

  // A null source is the black background: no raster, the dark canvas shows
  // through. Any other source turns the tiles back on under the new layer.
  setBackground(source) {
    this.tilesVisible = source !== null;
    if (source !== null) {
      this.tileLayer.setSource(source);
    }
  }

  drawTiles(p) {
    if (this.tilesVisible) {
      this.tileLayer.draw(p, this.camera);
    }
  }

  // Draws the public-transport network as static vector strokes — a shared
  // substrate panels compose rather than redraw themselves. The geometry comes
  // from the calling panel's engine; the style and world-unit width live here.
  drawBasemap(p, edges) {
    p.noFill();
    p.stroke(90, 100, 115);
    p.strokeWeight(1.1 / this.camera.scale);
    edges.forEach((polyline) => {
      p.beginShape();
      polyline.forEach(([east, north]) => {
        p.vertex(east, north);
      });
      p.endShape();
    });
  }
}
