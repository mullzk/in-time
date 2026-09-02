// The zoom a station is centred at unless the view is already closer.
export const MEDIUM_ZOOM_FRACTION = 0.5;

const NETWORK_ON_BLACK = [90, 100, 115];
const NETWORK_ON_RASTER = [18, 22, 30];

// Facade onto the core services a panel may touch — camera, time and the
// drawing helpers — rather than the whole VizCore.
export class PanelContext {
  constructor({ camera, time, tileLayer }) {
    this.camera = camera;
    this.time = time;
    this.tileLayer = tileLayer;
    // The black background has no tile source to draw from.
    this.tilesVisible = tileLayer.source !== null;
  }

  // A null source is the black background; any other one turns the tiles on.
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

  // The geometry comes from the calling panel's engine; the style and the
  // world-unit width live here.
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
