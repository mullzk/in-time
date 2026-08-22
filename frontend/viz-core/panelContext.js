// Halfway between the fully zoomed-out fit and the maximum zoom-in: the floor a
// station gets centred at, unless the view is already closer.
export const MEDIUM_ZOOM_FRACTION = 0.5;

// The network holds the ground it is drawn on by going the other way than that
// ground: a light blue-grey lifts it off the black canvas, while over a raster
// it goes dark, which carries on the pale relief and on the aerial imagery
// alike -- the imagery is dark, but nowhere near this dark, so the line reads as
// a drawn one rather than as part of the photo.
const NETWORK_ON_BLACK = [90, 100, 115];
const NETWORK_ON_RASTER = [18, 22, 30];

// Curated facade onto the core services a panel is allowed to touch — camera,
// projection, time, and the drawing helpers — rather than the whole VizCore.
// Panel-specific state (its VehiclePositionEngine) lives in the panel, not here.
export class PanelContext {
  constructor({ camera, projection, time, tileLayer }) {
    this.camera = camera;
    this.projection = projection;
    this.time = time;
    this.tileLayer = tileLayer;
    // The black background carries no raster, so a view that opens on it starts
    // with the tiles off rather than drawing from a source that is not there.
    this.tilesVisible = tileLayer.source !== null;
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

  // Centre the view on a station, raising the zoom to at least minZoomFraction
  // but never pulling it back when the view is already closer.
  focusStation(east, north, { minZoomFraction = MEDIUM_ZOOM_FRACTION } = {}) {
    if (this.camera.zoomFraction() < minZoomFraction) {
      this.camera.setZoomFraction(minZoomFraction);
    }
    this.camera.centerOn(east, north);
  }

  // Draws the public-transport network as static vector strokes — a shared
  // substrate panels compose rather than redraw themselves. The geometry comes
  // from the calling panel's engine; the style and world-unit width live here.
  drawBasemap(p, edges) {
    p.noFill();
    p.stroke(...(this.tilesVisible ? NETWORK_ON_RASTER : NETWORK_ON_BLACK));
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
