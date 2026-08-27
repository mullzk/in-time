import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// The latin subset carries every character Swiss station names use, so the
// larger subsets stay out of the repo.
const WEIGHTS = [400, 500, 600];
const fileName = (weight) => `arimo-latin-${weight}-normal.woff2`;

const sourceDirectory = new URL(
  '../node_modules/@fontsource/arimo/files/',
  import.meta.url,
);
const targetDirectory = new URL('../frontend/vendor/fonts/', import.meta.url);

const checkOnly = process.argv.includes('--check');

if (!checkOnly) {
  mkdirSync(fileURLToPath(targetDirectory), { recursive: true });
}

WEIGHTS.forEach((weight) => {
  const source = fileURLToPath(new URL(fileName(weight), sourceDirectory));
  const target = fileURLToPath(new URL(fileName(weight), targetDirectory));
  const sourceBytes = readFileSync(source);

  if (checkOnly) {
    if (!sourceBytes.equals(readFileSync(target))) {
      console.error(
        `frontend/vendor/fonts/${fileName(weight)} is out of sync with the ` +
          'pinned @fontsource/arimo package; run `npm run vendor` (and if ' +
          'needed `npm ci` before).',
      );
      process.exit(1);
    }
  } else {
    writeFileSync(target, sourceBytes);
  }
});

console.log(
  checkOnly
    ? 'vendored Arimo matches the pinned package.'
    : `vendored Arimo -> ${fileURLToPath(targetDirectory)}`,
);
