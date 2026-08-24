import { element } from './dom.js';

// Fixed, countable zoom stops for the display tile's slider; the wheel and pinch stay
// continuous and the slider snaps to the nearest stop.
export const ZOOM_STEPS = 7;

const LAST_POSITION = ZOOM_STEPS - 1;

export const zoomSliderPosition = (zoomFraction) =>
  Math.round(zoomFraction * LAST_POSITION);

export const zoomFractionForPosition = (position) => position / LAST_POSITION;

// The zoom control in the display tile. The camera also moves by wheel, pinch
// and keyboard, so the slider follows the camera rather than the other way
// round -- except while it is being dragged, when it would fight the hand
// holding it.
export class ZoomControl {
  constructor(camera) {
    this.camera = camera;
    this.scrubbing = false;
    this.slider = this.#buildSlider();
    this.root = element('div', 'control-options');
    this.root.appendChild(this.slider);
  }

  sync() {
    if (!this.scrubbing) {
      this.slider.value = String(
        zoomSliderPosition(this.camera.zoomFraction()),
      );
    }
  }

  #buildSlider() {
    const slider = element('input', 'control-slider');
    slider.type = 'range';
    slider.min = '0';
    slider.max = String(LAST_POSITION);
    slider.step = '1';
    slider.value = String(zoomSliderPosition(this.camera.zoomFraction()));
    slider.addEventListener('input', () => {
      this.scrubbing = true;
      this.camera.setZoomFraction(
        zoomFractionForPosition(Number(slider.value)),
      );
    });
    slider.addEventListener('change', () => {
      this.scrubbing = false;
    });
    return slider;
  }
}
