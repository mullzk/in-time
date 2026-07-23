import { element } from './dom.js';
import { MAX_TEMPO, MIN_TEMPO, SECONDS_PER_DAY } from './timeModel.js';

const pad = (value) => String(value).padStart(2, '0');

// Operating time runs past 24:00; show it as wall-clock hours and minutes
// (01:04, not 25:04:xx).
const formatClock = (seconds) => {
  const whole = Math.floor(seconds) % SECONDS_PER_DAY;
  return `${pad(Math.floor(whole / 3600))}:${pad(Math.floor((whole % 3600) / 60))}`;
};

// Tempo is schedule-seconds advanced per real second; show the wall-clock span
// one real second covers.
const formatTempo = (tempo) => `1 s ≙ ${Math.round(tempo / 60)} min`;

// Floating DOM control surface: renders only the controls the panel declares
// through its capabilities, split into a tempo cluster and a time cluster.
export class Cockpit {
  constructor(container, panel, time) {
    this.time = time;
    this.scrubbing = false;
    this.tempoScrubbing = false;
    this.root = element('div', 'cockpit');

    if (panel.capabilities.transport) {
      this.root.appendChild(this.#buildTransport());
    }
    if (panel.capabilities.transport && panel.capabilities.fullDayScrubber) {
      this.root.appendChild(element('div', 'cockpit-divider'));
    }
    if (panel.capabilities.fullDayScrubber) {
      this.root.appendChild(this.#buildScrubber());
    }

    container.appendChild(this.root);
  }

  #buildTransport() {
    const group = this.#group('Tempo');
    const controls = element('div', 'cockpit-controls');

    this.playButton = element('button', 'cockpit-play');
    this.playButton.type = 'button';
    this.playButton.addEventListener('click', () => this.time.togglePlay());

    // The lowest value is pause; above it the range is MIN_TEMPO..MAX_TEMPO.
    this.tempoSlider = element('input', 'cockpit-tempo');
    this.tempoSlider.type = 'range';
    this.tempoSlider.min = '0';
    this.tempoSlider.max = String(MAX_TEMPO);
    this.tempoSlider.step = 'any';
    this.tempoSlider.value = String(this.time.tempo);
    this.tempoSlider.addEventListener('input', () => this.#onTempoInput());
    this.tempoSlider.addEventListener('change', () => {
      this.tempoScrubbing = false;
    });

    this.tempoValue = element('span', 'cockpit-tempo-value');

    controls.append(this.playButton, this.tempoSlider, this.tempoValue);
    group.appendChild(controls);
    return group;
  }

  #onTempoInput() {
    this.tempoScrubbing = true;
    const value = Number(this.tempoSlider.value);
    if (value < MIN_TEMPO) {
      this.time.pause();
    } else {
      this.time.setTempo(value);
      this.time.play();
    }
  }

  #buildScrubber() {
    const group = this.#group('Zeit');
    const controls = element('div', 'cockpit-controls');

    this.timeLabel = element('span', 'cockpit-clock');

    this.scrubber = element('input', 'cockpit-scrubber');
    this.scrubber.type = 'range';
    this.scrubber.min = '0';
    this.scrubber.max = '1';
    this.scrubber.step = 'any';
    this.scrubber.value = '0';
    this.scrubber.addEventListener('input', () => {
      this.scrubbing = true;
      this.time.seekToPosition(Number(this.scrubber.value));
    });
    this.scrubber.addEventListener('change', () => {
      this.scrubbing = false;
    });

    controls.append(this.timeLabel, this.scrubber);
    group.appendChild(controls);
    return group;
  }

  #group(label) {
    const group = element('div', 'cockpit-group');
    const heading = element('span', 'cockpit-label');
    heading.textContent = label;
    group.appendChild(heading);
    return group;
  }

  sync() {
    if (this.playButton) {
      this.playButton.textContent = this.time.playing ? 'Pause' : 'Play';
    }
    if (this.tempoValue) {
      this.tempoValue.textContent = this.time.playing
        ? formatTempo(this.time.tempo)
        : 'Pause';
    }
    if (this.tempoSlider && !this.tempoScrubbing) {
      this.tempoSlider.value = String(this.time.playing ? this.time.tempo : 0);
    }
    if (this.timeLabel) {
      this.timeLabel.textContent = formatClock(this.time.current);
    }
    if (this.scrubber && !this.scrubbing) {
      this.scrubber.value = String(this.time.scrubberPosition());
    }
  }
}
