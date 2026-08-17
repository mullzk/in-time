// The instrumentations the sidebar dropdown offers, in its order. Each is a
// document in the same format a listener could bring along; they are imported
// rather than fetched so they are there when the module is, and so a mistake in
// one shows on loading instead of on listening.

import { Instrumentation } from './instrumentation.js';
import drumSet from './instrumentations/drum-set.json' with { type: 'json' };
import guitarMuted from './instrumentations/guitar-muted.json' with {
  type: 'json',
};
import marimbaGm from './instrumentations/marimba-gm.json' with {
  type: 'json',
};
import soundFamilies from './instrumentations/sound-families.json' with {
  type: 'json',
};

export const INSTRUMENTATIONS = [
  marimbaGm,
  drumSet,
  guitarMuted,
  soundFamilies,
].map((document) => Instrumentation.fromDocument(document));
