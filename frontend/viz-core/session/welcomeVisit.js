import { localStorageOrForgetful } from './browserStorage.js';

// Whether the welcome is still due. What is kept is the moment it was last
// dismissed, so a visitor coming back after two years is greeted again; a
// browser that forgets its storage makes every visit a first one.
const STORAGE_KEY = 'in-time.welcome-dismissed-at';
const TWO_YEARS_IN_MILLIS = 2 * 365 * 24 * 60 * 60 * 1000;

export class WelcomeVisit {
  constructor(storage = localStorageOrForgetful(), now = () => Date.now()) {
    this.storage = storage;
    this.now = now;
  }

  isDue() {
    const dismissedAt = Number.parseInt(
      this.storage.getItem(STORAGE_KEY) ?? '',
      10,
    );
    if (Number.isNaN(dismissedAt)) {
      return true;
    }
    // A negative age means the mark lies ahead of the clock, which no honest
    // visit produces; it is treated as no mark at all.
    const age = this.now() - dismissedAt;
    return age < 0 || age > TWO_YEARS_IN_MILLIS;
  }

  recordDismissal() {
    this.storage.setItem(STORAGE_KEY, String(this.now()));
  }
}
