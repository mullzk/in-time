// Geometry of the station-node layer, all pure so it can be tested without a
// canvas: how large a node draws at a given zoom, which station sits under a
// screen point, and how a station serving several modes is outlined. Which
// stations show at all is the vehicle layers' decision.

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

// Where a station serves several modes its outline follows the most structural
// one: rail over tram over bus.
const STATION_MODE_PRIORITY = ['rail', 'tram', 'bus'];

export function dominantStationMode(modes) {
  return STATION_MODE_PRIORITY.find((mode) => modes.includes(mode)) ?? null;
}

// A generous tap target so small nodes stay hittable on touch.
export const STATION_HIT_RADIUS_PIXELS = 12;

// Zoomed out, a pick of that reach would swallow every click and the hover label
// would never rest, so it shrinks towards this floor as the view pulls back,
// leaving room to aim at a vehicle.
const STATION_HIT_RADIUS_FLOOR_PIXELS = 5;

export function stationPickRadiusPixels(zoomFraction) {
  return (
    STATION_HIT_RADIUS_FLOOR_PIXELS +
    (STATION_HIT_RADIUS_PIXELS - STATION_HIT_RADIUS_FLOOR_PIXELS) * zoomFraction
  );
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
