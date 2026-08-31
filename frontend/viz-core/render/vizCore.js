import p5 from '../../vendor/p5.esm.min.js';
import { CameraControls } from './cameraControls.js';
import { applyCameraTransform } from './cameraTransform.js';

// The vendored build still ships p5's friendly-error system, which re-fetches
// and regex-scans our modules at startup and false-flags domain names like
// `camera` (a p5 function) as redeclarations. We don't want the scan or the
// noise in this bundler-free app.
p5.disableFriendlyErrors = true;

const DEFAULT_GROUND_COLOR = [16, 18, 22];

// A frame the browser stalled on -- a schedule adopted while the picture runs, a
// tab that was away -- carries the wall clock of the whole stall, which at the
// fastest tempo would jump the schedule a quarter of an hour on.
const LONGEST_FRAME_SECONDS = 0.1;

// Every frame reads the position of every vehicle running at that moment. The
// clock runs off the elapsed time either way, so a halved rate costs only the
// smoothness of the motion, not the schedule.
const FRAMES_PER_SECOND = 30;

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
    p.frameRate(FRAMES_PER_SECOND);
    p.textFont(getComputedStyle(document.body).fontFamily);
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

  // Draws the panel inside the camera transform, so world LV95 metres map to
  // screen pixels exactly as Camera.worldToScreen does.
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
