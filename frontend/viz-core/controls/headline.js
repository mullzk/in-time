import { element } from './dom.js';

// Stands in while a view is still waiting for the schedule its station is in.
export const HEADLINE_WHILE_LOADING = 'Fahrplan wird geladen …';

// The question a view answers, written over its picture as plain DOM.
export class Headline {
  constructor(container) {
    this.root = element('p', 'panel-headline');
    container.appendChild(this.root);
  }

  // Called every frame, so unchanged text is left alone.
  show(question) {
    if (this.root.textContent !== question) {
      this.root.textContent = question;
    }
  }
}
