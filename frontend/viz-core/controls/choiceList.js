import { element } from './dom.js';

// One choice out of a handful, all of them on show. An option is
// { value, label }; the value is what comes back through onChoose.
export class ChoiceList {
  constructor(options, { onChoose, chosen = null } = {}) {
    this.onChoose = onChoose;
    this.options = [];
    this.chosen = chosen;
    this.root = element('div', 'choice-list');
    this.root.setAttribute('role', 'radiogroup');
    options.forEach((option) => {
      this.offer(option);
    });
  }

  // An option may arrive after the list is built and may be renamed later.
  offer({ value, label }) {
    const known = this.options.find((option) => option.value === value);
    if (known) {
      known.button.textContent = label;
      return;
    }
    const button = element('button', 'choice-list-option');
    button.type = 'button';
    button.setAttribute('role', 'radio');
    button.textContent = label;
    button.addEventListener('click', () => this.#choose(value));
    this.options.push({ value, button });
    this.root.appendChild(button);
    this.#markTheChosenOne();
  }

  withdraw(value) {
    const known = this.options.find((option) => option.value === value);
    known?.button.remove();
    this.options = this.options.filter((option) => option.value !== value);
    this.#markTheChosenOne();
  }

  // Shows a choice made elsewhere; unlike a click it is not announced back.
  show(value) {
    this.chosen = value;
    this.#markTheChosenOne();
  }

  #choose(value) {
    this.show(value);
    this.onChoose?.(value);
  }

  #markTheChosenOne() {
    this.options.forEach(({ value, button }) => {
      const chosen = value === this.chosen;
      button.classList.toggle('is-current', chosen);
      button.setAttribute('aria-checked', String(chosen));
    });
  }
}
