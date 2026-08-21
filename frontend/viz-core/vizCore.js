import p5 from '../vendor/p5.esm.min.js';
import { CameraControls } from './cameraControls.js';
import { applyCameraTransform } from './cameraTransform.js';

// The vendored build still ships p5's friendly-error system, which re-fetches
// and regex-scans our modules at startup and false-flags domain names like
// `camera` (a p5 function) as redeclarations. We don't want the scan or the
// noise in this bundler-free app.
p5.disableFriendlyErrors = true;

// The ground a map is drawn on: dark, so the relief and the vehicles carry the
// light. A panel that wants another one says so.
const DEFAULT_GROUND_COLOR = [16, 18, 22];

// A frame the browser stalled on -- a schedule adopted while the picture runs, a
// tab that was away -- carries the wall clock of the whole stall, and at the
// fastest tempo that would jump the schedule a quarter of an hour on. It counts
// for no more than an ordinary frame.
const LONGEST_FRAME_SECONDS = 0.1;

// Owns the single p5 instance-mode loop and drives the active panel. Panels draw
// in world coordinates (LV95); VizCore pushes the camera transform so geometry
// and, later, tiles stay coincident in one render loop.
export class VizCore {
  constructor(
    container,
    panel,
    context,
    { onFrameRendered, onCanvasReady, onZoomGesture } = {},
  ) {
    this.container = container;
    this.panel = panel;
    this.context = context;
    this.onFrameRendered = onFrameRendered;
    this.onCanvasReady = onCanvasReady;
    this.onZoomGesture = onZoomGesture;
    this.groundColor = panel.groundColor?.() ?? DEFAULT_GROUND_COLOR;
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
    this.controls = new CameraControls(canvas.elt, this.context.camera, {
      onZoomGesture: this.onZoomGesture,
    });
    this.panel.init?.(this.context);
    this.onCanvasReady?.(canvas.elt);
  }

  #renderFrame(p) {
    const deltaSeconds = Math.min(p.deltaTime / 1000, LONGEST_FRAME_SECONDS);
    this.context.time.advance(deltaSeconds);
    this.panel.update?.(this.context.time.current, deltaSeconds);

    p.background(...this.groundColor);
    this.#drawThroughCamera(p);
    this.panel.drawOverlay?.(p, this.context);
    this.onFrameRendered?.();
  }

  // Draw the panel inside the camera transform: world LV95 metres map to screen
  // pixels exactly as Camera.worldToScreen does, so one loop keeps geometry (and
  // later tiles) coincident. The negative y scale is the north-up flip.
  #drawThroughCamera(p) {
    p.push();
    applyCameraTransform(p, this.context.camera);
    this.panel.drawWorld(p, this.context);
    p.pop();
  }

  #resize(p) {
    p.resizeCanvas(this.container.clientWidth, this.container.clientHeight);
    this.context.camera.setViewport(p.width, p.height);
  }
}
