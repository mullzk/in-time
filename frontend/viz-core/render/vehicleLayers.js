// Which traffic a view has switched on, and what that makes visible: the layers
// a chosen one brings with it, whether a station's modes are carried by any of
// them, and when the stops layer follows the zoom. All pure, so the decisions
// can be tested without a canvas.

// A station's transport mode maps to the vehicle layers that reveal it. Rail
// vehicles split across a long-distance, an InterRegio and a regional layer, so
// a rail station surfaces whenever any of them shows.
const REVEALING_LAYERS_BY_MODE = new Map([
  ['rail', ['fernverkehr', 'interregio', 'regionalverkehr']],
  ['tram', ['tram']],
  ['bus', ['bus']],
]);
// From the most structural service to the least, the order they are offered in.
const VEHICLE_LAYER_KEYS = [
  'fernverkehr',
  'interregio',
  'regionalverkehr',
  'tram',
  'bus',
];

// A layer switched on for the user brings the more structural ones with it.
export function layersDownTo(layer) {
  return VEHICLE_LAYER_KEYS.slice(0, VEHICLE_LAYER_KEYS.indexOf(layer) + 1);
}

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
