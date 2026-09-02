// Base class for the viz-core plug-in contract. A panel declares `capabilities`
// (which of the shell's controls it needs) and implements the hooks VizCore
// calls: init(context), update(currentTimeSeconds, deltaSeconds), drawWorld(p5,
// context) inside the camera transform and drawOverlay(p5, context) in screen
// space. Everything beyond drawWorld is optional; VizCore invokes it
// defensively. There is no teardown: a view change reloads the page.
export class Panel {
  capabilities = {};
}
