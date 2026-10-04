/**
 * How the standing trains shape a hub: an opaque core of IC/EC, a ring of IR and
 * a ring of regional trains around it. Every layer grows by radius, so the pulse
 * swells quadratically.
 */
import { INTERREGIO, LONG_DISTANCE, REGIONAL } from './trainClasses.js';

export const HUB_STEADY_COLOR = [255, 0, 0];
export const HUB_NEUTRAL_COLOR = [70, 70, 70];

export const HUB_LAYER_OPACITY = {
  [LONG_DISTANCE]: 1,
  [INTERREGIO]: 0.6,
  [REGIONAL]: 0.3,
};

export const CORE_MINIMUM_RADIUS_PIXELS = 2;
const CORE_RADIUS_PIXELS_PER_LONG_DISTANCE_TRAIN = 2;
const RING_WIDTH_PIXELS_PER_INTERREGIO_TRAIN = 2;
const RING_WIDTH_PIXELS_PER_REGIONAL_TRAIN = 1.5;

// The breakpoint the styles read a phone at, and the share of its growth a hub
// keeps there: upright, a screen that narrow has the busiest hubs reaching
// across it.
const NARROW_VIEWPORT_PIXELS = 640;
const GROWTH_KEPT_ON_A_NARROW_UPRIGHT_SCREEN = 0.6;

export const hubGrowthFactor = (viewportWidth, viewportHeight) =>
  viewportWidth <= NARROW_VIEWPORT_PIXELS && viewportHeight > viewportWidth
    ? GROWTH_KEPT_ON_A_NARROW_UPRIGHT_SCREEN
    : 1;

// The factor holds back what the standing trains add, never the resting core:
// a hub with nothing in it stays as visible as everywhere else.
export function hubLayerRadii(counts, growthFactor = 1) {
  const coreRadius =
    CORE_MINIMUM_RADIUS_PIXELS +
    growthFactor *
      CORE_RADIUS_PIXELS_PER_LONG_DISTANCE_TRAIN *
      counts[LONG_DISTANCE];
  const interregioRadius =
    coreRadius +
    growthFactor * RING_WIDTH_PIXELS_PER_INTERREGIO_TRAIN * counts[INTERREGIO];
  const regionalRadius =
    interregioRadius +
    growthFactor * RING_WIDTH_PIXELS_PER_REGIONAL_TRAIN * counts[REGIONAL];
  return {
    [LONG_DISTANCE]: { inner: 0, outer: coreRadius },
    [INTERREGIO]: { inner: coreRadius, outer: interregioRadius },
    [REGIONAL]: { inner: interregioRadius, outer: regionalRadius },
  };
}
