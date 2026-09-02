// The browser's local storage, or a stand-in that forgets everything, so that
// nothing above has to ask whether storing works. A browser may refuse local
// storage outright -- reading the property alone already throws then -- or hand
// one out whose first write fails, which is why it is tried rather than asked.

const PROBE_KEY = 'in-time.storage-probe';

const FORGETFUL_STORAGE = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
};

// `readStorage` is called inside the attempt, since reaching for the storage is
// already part of what may fail.
export function localStorageOrForgetful(
  readStorage = () => window.localStorage,
) {
  try {
    const storage = readStorage();
    storage.setItem(PROBE_KEY, PROBE_KEY);
    storage.removeItem(PROBE_KEY);
    return storage;
  } catch {
    return FORGETFUL_STORAGE;
  }
}
