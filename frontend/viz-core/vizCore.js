import p5 from '../vendor/p5.esm.min.js';
import { CameraControls } from './cameraControls.js';

// The vendored build still ships p5's friendly-error system, which re-fetches
// and regex-scans our modules at startup and false-flags domain names like
// `camera` (a p5 function) as redeclarations. We don't want the scan or the
// noise in this bundler-free app.
p5.disableFriendlyErrors = true;

// Owns the single p5 instance-mode loop and drives the active panel. Panels draw
// in world coordinates (LV95); VizCore pushes the camera transform so geometry
// and, later, tiles stay coincident in one render loop.
export class VizCore {
  constructor(container, panel, context, { onFrameRendered } = {}) {
    this.container = container;
    this.panel = panel;
    this.context = context;
    this.onFrameRendered = onFrameRendered;
    this.instance = new p5((p) => this.#sketch(p), container);
  }

  // The p5 instance-mode entry point: p5 calls this once so we can register its
  // lifecycle callbacks. Each delegates to a named method to keep the loop flat.
  #sketch(p) {
    p.setup = () => this.#setup(p);
    p.draw = () => this.#renderFrame(p);
    p.windowResized = () => this.#resize(p);
  }

  #setup(p) {
    const canvas = p.createCanvas(
      this.container.clientWidth,
      this.container.clientHeight,
    );
    this.context.camera.setViewport(p.width, p.height);
    this.controls = new CameraControls(canvas.elt, this.context.camera);
    this.panel.init?.(this.context);
  }

  #renderFrame(p) {
    const deltaSeconds = p.deltaTime / 1000;
    this.context.time.advance(deltaSeconds);
    this.panel.update?.(this.context.time.current, deltaSeconds);

    p.background(16, 18, 22);
    this.#drawThroughCamera(p);
    this.panel.drawOverlay?.(p, this.context);
    this.onFrameRendered?.();
  }

  // Draw the panel inside the camera transform: world LV95 metres map to screen
  // pixels exactly as Camera.worldToScreen does, so one loop keeps geometry (and
  // later tiles) coincident. The negative y scale is the north-up flip.
  #drawThroughCamera(p) {
    const camera = this.context.camera;
    p.push();
    p.translate(camera.viewportWidth / 2, camera.viewportHeight / 2);
    p.scale(camera.scale, -camera.scale);
    p.translate(-camera.centerEast, -camera.centerNorth);
    this.panel.drawWorld(p, this.context);
    p.pop();
  }

  #resize(p) {
    p.resizeCanvas(this.container.clientWidth, this.container.clientHeight);
    this.context.camera.setViewport(p.width, p.height);
  }
}
