import { formatTimeOfDay } from '../time/timeOfDay.js';
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

// The controls that drive the simulation: play as a tile of its own, tempo and
// time of day as sections of the time tile. What a panel does not declare is
// neither built nor followed.
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
      this.#offerTime();
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
      // The tile's face is asked for every frame; there is nothing to follow.
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

  #offerTime() {
    this.timeLabel = element('span', 'transport-clock');
    this.scrubber = this.#buildScrubber();
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

  #onTempoInput() {
    this.tempoScrubbing = true;
    this.time.setTempo(tempoForSliderPosition(Number(this.tempoSlider.value)));
  }

  #buildScrubber() {
    const scrubber = element('input', 'transport-scrubber');
    scrubber.type = 'range';
    scrubber.min = '0';
    scrubber.max = '1';
    scrubber.step = 'any';
    scrubber.value = '0';
    scrubber.addEventListener('input', () => {
      this.scrubbing = true;
      this.time.seekToPosition(Number(scrubber.value));
    });
    scrubber.addEventListener('change', () => {
      this.scrubbing = false;
    });
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
