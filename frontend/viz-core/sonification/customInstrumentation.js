// The listener's own instrumentation: the boundary where typed text becomes a
// checked document, and the browser-local place it is kept. Nothing about it
// reaches the server.

import { Instrumentation } from './instrumentation.js';

const STORAGE_KEY = 'in-time.custom-instrumentation';

export const CUSTOM_INSTRUMENTATION_NAME = 'Eigene Vertonung';

const INDENT_SPACES = 2;

// Returns either { instrumentation } or { error }: a message in the language of
// the interface, naming what is wrong and where.
export function instrumentationFromText(text) {
  let document;
  try {
    document = JSON.parse(text);
  } catch (error) {
    return { error: `Kein gültiges JSON — ${error.message}` };
  }
  if (
    document === null ||
    typeof document !== 'object' ||
    Array.isArray(document)
  ) {
    return { error: 'Das Dokument muss ein JSON-Objekt sein' };
  }
  try {
    return { instrumentation: Instrumentation.fromDocument(document) };
  } catch (error) {
    return { error: error.message };
  }
}

// A delivered instrumentation becomes the listener's own by taking the one name
// reserved for it, so seeding from an already seeded document changes nothing.
export function seedTextFrom(document) {
  return JSON.stringify(
    { ...document, instrumentation: CUSTOM_INSTRUMENTATION_NAME },
    null,
    INDENT_SPACES,
  );
}

export class CustomInstrumentationStore {
  // `storage` is a Web Storage object; one that forgets everything works too,
  // and only the reach across reloads is then lost.
  constructor(storage) {
    this.storage = storage;
  }

  readText() {
    return this.storage.getItem(STORAGE_KEY);
  }

  read() {
    const text = this.readText();
    return text === null
      ? null
      : (instrumentationFromText(text).instrumentation ?? null);
  }

  // Only a document that plays is kept, so a half-written one never survives a
  // reload.
  write(text) {
    const result = instrumentationFromText(text);
    if (result.instrumentation) {
      this.storage.setItem(STORAGE_KEY, text);
    }
    return result;
  }

  clear() {
    this.storage.removeItem(STORAGE_KEY);
  }
}
