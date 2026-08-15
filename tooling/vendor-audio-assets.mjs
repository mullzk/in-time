import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { allSounds } from '../frontend/viz-core/sonification/sounds/registry.js';

// The sonification streams two kinds of assets that must be served from our own
// origin instead of a third-party host: GM soundfont instruments (one JavaScript
// file each, from the webaudiofont data set) and the uzu drum kit samples. This
// script mirrors the pinned upstream copies into frontend/vendor so the runtime
// never reaches out to a foreign host.
//
// What to mirror comes from the sound registry, not from a list kept here: a
// list of its own would drift from the sounds the app offers, and a sound whose
// asset is missing does not fail loudly, it falls silent.

const vendorRoot = fileURLToPath(
  new URL('../frontend/vendor/', import.meta.url),
);
const soundfontDir = `${vendorRoot}soundfonts/`;
const drumkitDir = `${vendorRoot}samples/uzu-drumkit/`;

const SOUNDFONT_BASE = 'https://felixroos.github.io/webaudiofontdata/sound';
const DRUMKIT_MAP_URL = 'https://strudel.b-cdn.net/uzu-drumkit.json';

const assetsOfType = (type) =>
  allSounds()
    .map((sound) => sound.asset)
    .filter((asset) => asset !== null && asset.type === type);

// The default shade (index 0) each soundfont name resolves to.
const SOUNDFONT_FILES = [
  ...new Set(assetsOfType('soundfont').map((asset) => asset.file)),
].sort();
// Only the banks the registry can strike; the full kit ships many more.
const USED_DRUM_BANKS = [
  ...new Set(assetsOfType('sample').map((asset) => asset.bank)),
].sort();

const writeFileEnsuringDir = (path, contents) => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
};

const fetchText = async (url) => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`fetch ${url} -> HTTP ${response.status}`);
  }
  return response.text();
};

const fetchBytes = async (url) => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`fetch ${url} -> HTTP ${response.status}`);
  }
  return Buffer.from(await response.arrayBuffer());
};

const trimmedDrumMapPath = `${drumkitDir}uzu-drumkit.json`;

// The runtime passes its own same-origin base, so the trimmed map drops the
// upstream _base and keeps only the banks the presets use.
const trimDrumMap = (upstream) => {
  const trimmed = {};
  USED_DRUM_BANKS.forEach((bank) => {
    if (!upstream[bank]) {
      throw new Error(`upstream drum kit is missing bank ${bank}`);
    }
    trimmed[bank] = upstream[bank];
  });
  return trimmed;
};

const download = async () => {
  await Promise.all(
    SOUNDFONT_FILES.map(async (name) => {
      const contents = await fetchText(`${SOUNDFONT_BASE}/${name}.js`);
      writeFileEnsuringDir(`${soundfontDir}${name}.js`, contents);
    }),
  );

  const upstream = JSON.parse(await fetchText(DRUMKIT_MAP_URL));
  const base = upstream._base;
  const trimmed = trimDrumMap(upstream);
  await Promise.all(
    Object.values(trimmed)
      .flat()
      .map(async (relativePath) => {
        const bytes = await fetchBytes(`${base}${relativePath}`);
        writeFileEnsuringDir(`${drumkitDir}${relativePath}`, bytes);
      }),
  );
  writeFileEnsuringDir(
    trimmedDrumMapPath,
    `${JSON.stringify(trimmed, null, 2)}\n`,
  );

  const wavCount = Object.values(trimmed).flat().length;
  console.log(
    `vendored ${SOUNDFONT_FILES.length} soundfonts and ${wavCount} drum ` +
      `samples -> ${vendorRoot}`,
  );
};

const check = () => {
  const missing = [];
  SOUNDFONT_FILES.forEach((name) => {
    if (!existsSync(`${soundfontDir}${name}.js`)) {
      missing.push(`soundfonts/${name}.js`);
    }
  });
  if (!existsSync(trimmedDrumMapPath)) {
    missing.push('samples/uzu-drumkit/uzu-drumkit.json');
  } else {
    const map = JSON.parse(readFileSync(trimmedDrumMapPath, 'utf8'));
    USED_DRUM_BANKS.forEach((bank) => {
      (map[bank] ?? [`<bank ${bank} absent>`]).forEach((relativePath) => {
        if (!existsSync(`${drumkitDir}${relativePath}`)) {
          missing.push(`samples/uzu-drumkit/${relativePath}`);
        }
      });
    });
  }
  if (missing.length > 0) {
    console.error(
      'vendored audio assets are incomplete; run `npm run vendor`:\n  ' +
        missing.join('\n  '),
    );
    process.exit(1);
  }
  const wavCount = readdirSync(drumkitDir, { recursive: true }).filter((name) =>
    name.endsWith('.wav'),
  ).length;
  console.log(
    `vendored audio assets present: ${SOUNDFONT_FILES.length} soundfonts, ` +
      `${wavCount} drum samples.`,
  );
};

if (process.argv.includes('--check')) {
  check();
} else {
  await download();
}
