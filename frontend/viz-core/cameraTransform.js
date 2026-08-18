// The one place the camera becomes a drawing transform: LV95 world metres onto
// screen pixels, with the negative y scale as the north-up flip. The live canvas
// and any layer painted beside it apply the same one, so they cannot drift.
export function applyCameraTransform(target, camera) {
  target.translate(camera.viewportWidth / 2, camera.viewportHeight / 2);
  target.scale(camera.scale, -camera.scale);
  target.translate(-camera.centerEast, -camera.centerNorth);
}
