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

export function hubLayerRadii(counts) {
  const coreRadius =
    CORE_MINIMUM_RADIUS_PIXELS +
    CORE_RADIUS_PIXELS_PER_LONG_DISTANCE_TRAIN * counts[LONG_DISTANCE];
  const interregioRadius =
    coreRadius + RING_WIDTH_PIXELS_PER_INTERREGIO_TRAIN * counts[INTERREGIO];
  const regionalRadius =
    interregioRadius + RING_WIDTH_PIXELS_PER_REGIONAL_TRAIN * counts[REGIONAL];
  return {
    [LONG_DISTANCE]: { inner: 0, outer: coreRadius },
    [INTERREGIO]: { inner: coreRadius, outer: interregioRadius },
    [REGIONAL]: { inner: interregioRadius, outer: regionalRadius },
  };
}
