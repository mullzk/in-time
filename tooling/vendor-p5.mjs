import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const source = fileURLToPath(
  new URL('../node_modules/p5/lib/p5.esm.min.js', import.meta.url),
);
const target = fileURLToPath(
  new URL('../frontend/vendor/p5.esm.min.js', import.meta.url),
);

const checkOnly = process.argv.includes('--check');
const sourceBytes = readFileSync(source);

if (checkOnly) {
  const targetBytes = readFileSync(target);
  if (!sourceBytes.equals(targetBytes)) {
    console.error(
      'frontend/vendor/p5.esm.min.js is out of sync with the pinned p5 ' +
        'package; run `npm run vendor`.',
    );
    process.exit(1);
  }
  console.log('vendored p5 matches the pinned package.');
} else {
  writeFileSync(target, sourceBytes);
  console.log(`vendored p5 -> ${target}`);
}
