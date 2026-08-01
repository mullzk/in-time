// Base class for the viz-core plug-in contract. A panel declares `capabilities`
// (which cockpit controls it needs) and implements the lifecycle hooks the
// VizCore calls: init(context), update(currentTimeSeconds, deltaSeconds),
// drawWorld(p5, context) inside the camera transform and drawOverlay(p5, context)
// in screen space. Hooks beyond drawWorld are optional; VizCore invokes them
// defensively. There is no teardown: a view change reloads the page, so a
// document carries one panel until its end.
export class Panel {
  capabilities = {};
}
