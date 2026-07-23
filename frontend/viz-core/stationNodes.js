// Geometry for the station-node layer: how large a node is at a given zoom, and
// which station sits under a screen point. Both are pure so they can be tested
// without a canvas.

const NODE_SMALL_FROM_FRACTION = 0.5;
const NODE_LARGE_FROM_FRACTION = 5 / 6;
const NODE_SMALL_DIAMETER_PIXELS = 3;
const NODE_LARGE_DIAMETER_PIXELS = 5;

// No nodes on the country overview; small dots from the half zoom, larger from
// the second-largest of the seven zoom steps.
export function nodeDiameterPixels(zoomFraction) {
  if (zoomFraction < NODE_SMALL_FROM_FRACTION) {
    return 0;
  }
  if (zoomFraction < NODE_LARGE_FROM_FRACTION) {
    return NODE_SMALL_DIAMETER_PIXELS;
  }
  return NODE_LARGE_DIAMETER_PIXELS;
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
