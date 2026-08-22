import { formatTimeOfDay } from './clock.js';
import { element } from './dom.js';
import {
  sliderPositionForTempo,
  tempoForSliderPosition,
} from './tempoSlider.js';

// Tempo is schedule-seconds advanced per real second; show the wall-clock span
// one real second covers, in the unit that span is legible in.
const SECONDS_PER_MINUTE = 60;
const formatTempo = (tempo) =>
  tempo < SECONDS_PER_MINUTE
    ? `1 s ≙ ${Math.round(tempo)} s`
    : `1 s ≙ ${Math.round(tempo / SECONDS_PER_MINUTE)} min`;

// The controls that drive the simulation: the hand that stops and starts the
// picture, which is a tile of its own because it is pressed far more often than
// anything else is set, and the tempo and the time of day as sections of the
// time tile. What a panel does not declare is neither built nor followed -- a
// view whose time stands has no scrubber position to be asked for.
export class TransportControls {
  constructor(panel, time) {
    this.time = time;
    this.scrubbing = false;
    this.tempoScrubbing = false;
    this.offered = [];

    if (panel.capabilities.simulationSpeed) {
      this.#offerPlay();
      this.#offerTempo();
    }
    if (panel.capabilities.timeScrubber) {
      this.#offerTime(panel.capabilities.timeSeeking);
    }
  }

  sections() {
    return this.offered.map(({ section }) => section);
  }

  sync() {
    this.offered.forEach(({ follow }) => {
      follow();
    });
  }

  // The one control that is its own tile: it is not set but pressed, and what it
  // will do next is written on its face.
  #offerPlay() {
    this.offered.push({
      section: {
        id: 'play',
        title: 'Wiedergabe',
        onActivate: () => this.time.togglePlay(),
        face: () =>
          this.time.playing
            ? { icon: 'pause', label: 'Pause' }
            : { icon: 'play', label: 'Wiedergabe' },
        keepInExhibition: true,
      },
      // Its face is asked for on every frame; there is nothing else to follow.
      follow: () => {},
    });
  }

  #offerTempo() {
    this.tempoSlider = this.#buildTempoSlider();
    this.tempoValue = element('span', 'transport-tempo-value');
    this.offered.push({
      section: {
        id: 'tempo',
        title: 'Simulations-Tempo',
        element: this.#tempoControls(),
        keepInExhibition: true,
      },
      follow: () => this.#followTempo(),
    });
  }

  #offerTime(seekable) {
    this.timeLabel = element('span', 'transport-clock');
    this.scrubber = this.#buildScrubber(seekable);
    this.offered.push({
      section: {
        id: 'clock',
        title: 'Tageszeit',
        element: this.#timeControls(),
        keepInExhibition: true,
      },
      follow: () => this.#followTime(),
    });
  }

  #tempoControls() {
    const controls = element('div', 'transport-controls');
    controls.append(this.tempoSlider, this.tempoValue);
    return controls;
  }

  #timeControls() {
    const controls = element('div', 'transport-controls');
    controls.append(this.timeLabel, this.scrubber);
    return controls;
  }

  // The slider carries a travel position, not a tempo: it runs geometrically
  // over the tempo range.
  #buildTempoSlider() {
    const slider = element('input', 'transport-tempo');
    slider.type = 'range';
    slider.min = '0';
    slider.max = '1';
    slider.step = 'any';
    slider.value = String(sliderPositionForTempo(this.time.tempo));
    slider.addEventListener('input', () => this.#onTempoInput());
    slider.addEventListener('change', () => {
      this.tempoScrubbing = false;
    });
    return slider;
  }

  // Choosing a tempo says how fast, not whether: a picture standing still keeps
  // standing, and takes the chosen tempo up when it is started again.
  #onTempoInput() {
    this.tempoScrubbing = true;
    this.time.setTempo(tempoForSliderPosition(Number(this.tempoSlider.value)));
  }

  // A view whose time cannot be sought keeps the scrubber as a reading: it says
  // how far the clock has come, and the hand is turned away from it.
  #buildScrubber(seekable) {
    const scrubber = element('input', 'transport-scrubber');
    scrubber.type = 'range';
    scrubber.min = '0';
    scrubber.max = '1';
    scrubber.step = 'any';
    scrubber.value = '0';
    scrubber.disabled = !seekable;
    if (seekable) {
      scrubber.addEventListener('input', () => {
        this.scrubbing = true;
        this.time.seekToPosition(Number(scrubber.value));
      });
      scrubber.addEventListener('change', () => {
        this.scrubbing = false;
      });
    }
    return scrubber;
  }

  #followTempo() {
    this.tempoValue.textContent = formatTempo(this.time.tempo);
    if (!this.tempoScrubbing) {
      this.tempoSlider.value = String(sliderPositionForTempo(this.time.tempo));
    }
  }

  #followTime() {
    this.timeLabel.textContent = formatTimeOfDay(this.time.current);
    if (!this.scrubbing) {
      this.scrubber.value = String(this.time.scrubberPosition());
    }
  }
}
