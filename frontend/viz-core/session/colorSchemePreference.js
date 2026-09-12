import { localStorageOrForgetful } from './browserStorage.js';

const STORAGE_KEY = 'in-time.color-scheme';
const COLOR_BLIND = 'color-blind';

// Whether the visitor asked for the colour-blind scheme, kept for later visits.
// The choice is held here as well as stored, so a browser that forgets its
// storage can still switch back within the visit.
export class ColorSchemePreference {
  constructor(storage = localStorageOrForgetful()) {
    this.storage = storage;
    this.colorBlind = storage.getItem(STORAGE_KEY) === COLOR_BLIND;
  }

  prefersColorBlindScheme() {
    return this.colorBlind;
  }

  toggle() {
    this.colorBlind = !this.colorBlind;
    if (this.colorBlind) {
      this.storage.setItem(STORAGE_KEY, COLOR_BLIND);
    } else {
      this.storage.removeItem(STORAGE_KEY);
    }
    return this.colorBlind;
  }
}
