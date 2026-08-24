// swisstopo approximate formulas WGS84 -> LV95 (EPSG:2056); the magic constants
// are swisstopo's published polynomial coefficients, accurate to ~1 m within
// Switzerland. Inputs are decimal degrees.
export function wgs84ToLv95(latitude, longitude) {
  const phi = (latitude * 3600 - 169028.66) / 10000;
  const lambda = (longitude * 3600 - 26782.5) / 10000;

  const east =
    2_600_072.37 +
    211455.93 * lambda -
    10938.51 * lambda * phi -
    0.36 * lambda * phi ** 2 -
    44.54 * lambda ** 3;

  const north =
    1_200_147.07 +
    308807.95 * phi +
    3745.25 * lambda ** 2 +
    76.63 * phi ** 2 -
    194.56 * lambda ** 2 * phi +
    119.79 * phi ** 3;

  return [east, north];
}
