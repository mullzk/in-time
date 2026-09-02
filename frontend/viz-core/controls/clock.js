import { formatTimeOfDay } from '../time/timeOfDay.js';
import { element } from './dom.js';

// The moment the picture stands at, in hours and minutes.
export class Clock {
  constructor(container) {
    this.root = element('time', 'panel-clock');
    container.appendChild(this.root);
  }

  // Called every frame, so unchanged text is left alone.
  show(timeOfDaySeconds) {
    const written = formatTimeOfDay(timeOfDaySeconds);
    if (this.root.textContent !== written) {
      this.root.textContent = written;
      this.root.dateTime = written;
    }
  }
}
