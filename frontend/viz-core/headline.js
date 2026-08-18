import { element } from './dom.js';

// The question a view answers, written over its picture. Plain DOM: the layout
// -- including making way for the sidebar -- is the stylesheet's business, not
// the canvas's.
export class Headline {
  constructor(container) {
    this.root = element('p', 'panel-headline');
    container.appendChild(this.root);
  }

  // Called every frame, so unchanged text is left alone rather than rewritten
  // sixty times a second.
  show(question) {
    if (this.root.textContent !== question) {
      this.root.textContent = question;
    }
  }
}
