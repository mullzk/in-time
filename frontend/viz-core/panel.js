// Base class for the viz-core plug-in contract. A panel declares `capabilities`
// (which cockpit controls it needs) and implements the lifecycle hooks the
// VizCore calls: init(context), update(t, dt), drawWorld(p5, context) inside the
// camera transform, drawOverlay(p5, context) in screen space, teardown(). Hooks
// beyond drawWorld are optional; VizCore invokes them defensively.
export class Panel {
  capabilities = {};
}
