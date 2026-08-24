import { seedTextFrom } from '../sonification/customInstrumentation.js';
import { allSounds } from '../sonification/sounds/registry.js';
import { element } from './dom.js';

const FALLBACK_FILE_STEM = 'eigene-vertonung';

const KIND_LABELS = {
  pitched: 'Klangfarben mit Tonhöhe',
  percussive: 'Klangfarben zum Schlagen',
};

// The gist of the format, as far as it is needed while writing; the full account
// is the README next to the delivered documents.
const FORMAT_NOTES = [
  [
    'Aufbau',
    'Zwei Ebenen tief: das Dokument nennt Verkehrsträger, ein Verkehrsträger nennt Ereignisse. An der Wurzel sind "instrumentation" (der Name) und "sound" Pflicht.',
  ],
  ['Verkehrsträger', 'fernverkehr, interregio, regionalverkehr, tram, bus'],
  [
    'Ereignisse',
    'arrival, departure, passthrough, dwell — letzteres, solange ein Fahrzeug steht.',
  ],
  [
    'Vererbung',
    'Die tiefste Angabe gewinnt: Ereignis vor Verkehrsträger vor Dokument vor Klangfarbe. Weggelassenes klingt wie die Ebene darüber, ein "sound" weiter unten setzt den Grundklang neu.',
  ],
  [
    'dwellType',
    'An der Wurzel oder beim Verkehrsträger: none (still), once (ein Klang, der ausklingt), repeat (alle intervalSeconds ein Schlag).',
  ],
  [
    'Häufige Angaben',
    'gain, note, pan (left, center, right oder 0 bis 1), attack, decay, sustain, release, speed, cutoff. Dazu duration als Haltedauer, noteAdjust (Halbtöne auf note) und gainFactor (Faktor auf gain).',
  ],
];

// The name is written by hand, so everything a file system could stumble over
// becomes a hyphen; a name made of nothing else falls back to a fixed stem.
export function downloadFileNameFor(instrumentationName) {
  const stem = instrumentationName
    .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
  return `${stem || FALLBACK_FILE_STEM}.json`;
}

const soundNameRows = () =>
  Object.entries(KIND_LABELS).map(([kind, label]) => [
    label,
    allSounds()
      .filter((sound) => sound.kind === kind)
      .map((sound) => sound.name)
      .join(', '),
  ]);

// A drawer opposite the dock in which a listener writes an instrumentation
// document and hears it at once. Every keystroke is checked: a document that
// plays is kept and handed on, a faulty one only names its mistake, so a
// half-written state never breaks off the sound. The drawer keeps no state of
// its own -- the text lives in the store it was given, which is why closing and
// reopening, or reloading the page, finds the same document.
export class InstrumentationEditor {
  // `onInstrumentationChanged` is called with every version that plays,
  // including the one the drawer opens with; `onInstrumentationDiscarded` when
  // the document is thrown away and there is none any more.
  constructor(
    container,
    store,
    { onInstrumentationChanged, onInstrumentationDiscarded },
  ) {
    this.store = store;
    this.onInstrumentationChanged = onInstrumentationChanged;
    this.onInstrumentationDiscarded = onInstrumentationDiscarded;

    this.panel = element('aside', 'instrumentation-editor');
    this.panel.setAttribute('aria-label', 'Eigene Vertonung');
    this.panel.append(
      this.#title(),
      this.#textArea(),
      this.#message(),
      this.#actions(),
      this.#reference(),
    );

    container.appendChild(this.panel);
    this.#setOpen(false);
  }

  // The one way in and out: whoever opened the drawer closes it again with the
  // same button. `templateDocument` is what a first document is seeded from and
  // is ignored once one has been written.
  toggle(templateDocument) {
    if (this.isOpen) {
      this.#close();
      return;
    }
    this.textArea.value =
      this.store.readText() ?? seedTextFrom(templateDocument);
    this.#applyText();
    this.#setOpen(true);
    this.textArea.focus();
  }

  #close() {
    this.#setOpen(false);
  }

  #title() {
    const title = element('h2', 'instrumentation-editor-title');
    title.textContent = 'Eigene Vertonung';
    return title;
  }

  #actions() {
    const actions = element('div', 'instrumentation-editor-actions');
    this.downloadButton = this.#action('Herunterladen', () => this.#download());
    actions.append(
      this.downloadButton,
      this.#action('Schliessen', () => this.#close()),
      this.#action(
        'Löschen',
        () => this.#discard(),
        'instrumentation-editor-discard',
      ),
    );
    return actions;
  }

  #action(label, onClick, extraClass) {
    const button = element(
      'button',
      extraClass
        ? `instrumentation-editor-action ${extraClass}`
        : 'instrumentation-editor-action',
    );
    button.type = 'button';
    button.textContent = label;
    button.addEventListener('click', onClick);
    return button;
  }

  #textArea() {
    this.textArea = element('textarea', 'instrumentation-editor-text');
    this.textArea.spellcheck = false;
    this.textArea.setAttribute('aria-label', 'Instrumentation als JSON');
    this.textArea.addEventListener('input', () => this.#applyText());
    return this.textArea;
  }

  #message() {
    this.messageLine = element('p', 'instrumentation-editor-message');
    return this.messageLine;
  }

  #reference() {
    const reference = element('details', 'instrumentation-editor-reference');
    const summary = element('summary');
    summary.textContent = 'Aufbau und Klangfarben';

    const notes = element('dl', 'instrumentation-editor-notes');
    [...FORMAT_NOTES, ...soundNameRows()].forEach(([subject, explanation]) => {
      const term = element('dt');
      term.textContent = subject;
      const detail = element('dd');
      detail.textContent = explanation;
      notes.append(term, detail);
    });

    reference.append(summary, notes);
    return reference;
  }

  // Throwing the document away is what makes the next "Selber vertonen" start
  // from a delivered instrumentation again instead of from this one.
  #discard() {
    this.store.clear();
    this.#close();
    this.onInstrumentationDiscarded();
  }

  #applyText() {
    const { instrumentation, error } = this.store.write(this.textArea.value);
    this.messageLine.textContent = error ?? '';
    this.downloadButton.disabled = error !== undefined;
    if (instrumentation) {
      this.instrumentationName = instrumentation.name;
      this.onInstrumentationChanged(instrumentation);
    }
  }

  // The document never leaves the browser, so it is handed out from memory
  // rather than fetched; the button is off while the text is faulty, which is
  // what makes the field's own content the last version that played.
  #download() {
    const url = URL.createObjectURL(
      new Blob([this.textArea.value], { type: 'application/json' }),
    );
    const link = element('a');
    link.href = url;
    link.download = downloadFileNameFor(this.instrumentationName);
    this.panel.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  #setOpen(open) {
    this.isOpen = open;
    this.panel.classList.toggle('is-open', open);
  }
}
