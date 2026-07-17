import { MAX_TEMPO, MIN_TEMPO, SECONDS_PER_DAY } from './timeModel.js';

const pad = (value) => String(value).padStart(2, '0');

// Operating time runs past 24:00; show it as wall-clock (01:04, not 25:04).
const formatClock = (seconds) => {
  const whole = Math.floor(seconds) % SECONDS_PER_DAY;
  return `${pad(Math.floor(whole / 3600))}:${pad(Math.floor((whole % 3600) / 60))}:${pad(whole % 60)}`;
};

const element = (tag, className) => {
  const node = document.createElement(tag);
  if (className) {
    node.className = className;
  }
  return node;
};

// Floating DOM control surface: renders only the controls the panel declares
// through its capabilities.
export class Cockpit {
  constructor(container, panel, time) {
    this.time = time;
    this.scrubbing = false;
    this.root = element('div', 'cockpit');

    if (panel.capabilities.transport) {
      this.#buildTransport();
    }
    if (panel.capabilities.fullDayScrubber) {
      this.#buildScrubber();
    }

    container.appendChild(this.root);
  }

  #buildTransport() {
    this.playButton = element('button', 'cockpit-play');
    this.playButton.type = 'button';
    this.playButton.addEventListener('click', () => this.time.togglePlay());
    this.root.appendChild(this.playButton);

    this.tempoSlider = element('input', 'cockpit-tempo');
    this.tempoSlider.type = 'range';
    this.tempoSlider.min = String(MIN_TEMPO);
    this.tempoSlider.max = String(MAX_TEMPO);
    this.tempoSlider.value = String(this.time.tempo);
    this.tempoSlider.addEventListener('input', () => {
      this.time.setTempo(Number(this.tempoSlider.value));
    });
    this.root.appendChild(this.tempoSlider);
  }

  #buildScrubber() {
    this.timeLabel = element('span', 'cockpit-clock');
    this.root.appendChild(this.timeLabel);

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
    this.root.appendChild(this.scrubber);
  }

  sync() {
    if (this.playButton) {
      this.playButton.textContent = this.time.playing ? 'Pause' : 'Play';
    }
    if (this.timeLabel) {
      this.timeLabel.textContent = formatClock(this.time.current);
    }
    if (this.scrubber && !this.scrubbing) {
      this.scrubber.value = String(this.time.scrubberPosition());
    }
  }
}
