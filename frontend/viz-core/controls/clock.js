import { formatTimeOfDay } from '../time/timeOfDay.js';
import { element } from './dom.js';

// The moment the picture stands at, written at the right end of the top bar.
// Hours and minutes only: the panel runs time at whatever tempo the user picks,
// where seconds would only flicker.
export class Clock {
  constructor(container) {
    this.root = element('time', 'panel-clock');
    container.appendChild(this.root);
  }

  // Called every frame, so an unchanged minute is left alone rather than
  // rewritten sixty times a second.
  show(timeOfDaySeconds) {
    const written = formatTimeOfDay(timeOfDaySeconds);
    if (this.root.textContent !== written) {
      this.root.textContent = written;
      this.root.dateTime = written;
    }
  }
}
