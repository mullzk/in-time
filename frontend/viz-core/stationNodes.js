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

// A station's transport mode maps to the vehicle layers that reveal it. Rail
// vehicles split across a long-distance, an InterRegio and a regional layer, so
// a rail station surfaces whenever any of them shows.
const REVEALING_LAYERS_BY_MODE = new Map([
  ['rail', ['fernverkehr', 'interregio', 'regionalverkehr']],
  ['tram', ['tram']],
  ['bus', ['bus']],
]);
const VEHICLE_LAYER_KEYS = [
  'fernverkehr',
  'interregio',
  'regionalverkehr',
  'tram',
  'bus',
];

export function stationIsShown(modes, stopsShown, layers) {
  return (
    stopsShown &&
    modes.some((mode) =>
      (REVEALING_LAYERS_BY_MODE.get(mode) ?? []).some((key) => layers[key]),
    )
  );
}

// Turning the stops layer on while every vehicle layer is off would show
// nothing, so fall back to the regional rail layer to reveal at least the train
// stops.
export function fallbackLayerForStops(layers) {
  return VEHICLE_LAYER_KEYS.some((key) => layers[key])
    ? null
    : 'regionalverkehr';
}

// Revealing a searched station: if none of the layers that would surface its
// modes is on, name the first that reveals it so its node actually draws.
// Returns null when a revealing layer already shows, so nothing must change.
export function layerToRevealStation(modes, layers) {
  const revealing = modes.flatMap(
    (mode) => REVEALING_LAYERS_BY_MODE.get(mode) ?? [],
  );
  return revealing.some((key) => layers[key]) ? null : (revealing[0] ?? null);
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
