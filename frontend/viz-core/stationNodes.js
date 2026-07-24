// Geometry and visibility decisions for the station-node layer, all pure so they
// can be tested without a canvas: node size at a given zoom, which station sits
// under a screen point, whether a station shows, and how it is outlined.

const NODE_LARGE_FROM_FRACTION = 5 / 6;
const NODE_SMALL_DIAMETER_PIXELS = 3;
const NODE_LARGE_DIAMETER_PIXELS = 5;

// Small dots up to the second-largest of the seven zoom steps, larger beyond.
// Whether nodes show at all is the stops layer's decision, not the zoom's.
export function nodeDiameterPixels(zoomFraction) {
  return zoomFraction < NODE_LARGE_FROM_FRACTION
    ? NODE_SMALL_DIAMETER_PIXELS
    : NODE_LARGE_DIAMETER_PIXELS;
}

export function stationIsShown(modes, stopsShown, layers) {
  return stopsShown && modes.some((mode) => layers[mode]);
}

// Turning the stops layer on while every vehicle layer is off would show
// nothing, so fall back to rail to reveal at least the train stops.
export function fallbackModeForStops(layers) {
  return !layers.rail && !layers.tram && !layers.bus ? 'rail' : null;
}

// Where a station serves several modes its outline follows the most structural
// one: rail over tram over bus.
const STATION_MODE_PRIORITY = ['rail', 'tram', 'bus'];

export function dominantStationMode(modes) {
  return STATION_MODE_PRIORITY.find((mode) => modes.includes(mode)) ?? null;
}

// Crossing the zoom threshold flips the stops layer (in -> show, out -> hide);
// staying on one side returns null so a manual choice persists between crossings.
export function stopsToggleOnZoomCross(
  previousFraction,
  currentFraction,
  threshold,
) {
  const wasShown = previousFraction >= threshold;
  const isShown = currentFraction >= threshold;
  return wasShown === isShown ? null : isShown;
}

export function nearestStation(stations, camera, screenX, screenY, maxPixels) {
  let nearest = null;
  let nearestDistanceSquared = maxPixels * maxPixels;
  stations.forEach((station) => {
    const [x, y] = camera.worldToScreen(station.east, station.north);
    const distanceSquared = (x - screenX) ** 2 + (y - screenY) ** 2;
    if (distanceSquared <= nearestDistanceSquared) {
      nearest = station;
      nearestDistanceSquared = distanceSquared;
    }
  });
  return nearest;
}
