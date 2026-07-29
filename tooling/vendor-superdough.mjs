import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const entry = fileURLToPath(new URL('./superdough-entry.mjs', import.meta.url));
// Vendored as .js, not .mjs: the file is an ESM bundle either way, but static
// hosts (our nginx) map only .js to a JavaScript MIME type, so a .mjs would be
// served as octet-stream and rejected by the browser's module MIME check.
const target = fileURLToPath(
  new URL('../frontend/vendor/superdough.js', import.meta.url),
);

// superdough ships its AudioWorklet sources as inlined data: URLs, so a single
// self-contained bundle needs no sidecar assets. The one exception is the
// Cyclist scheduler's SharedWorker, whose asset URL stays unresolved — we drive
// playback by calling superdough() with explicit deadlines and never start that
// clock, so the reference is never reached.
const result = await build({
  entryPoints: [entry],
  bundle: true,
  format: 'esm',
  target: 'es2022',
  platform: 'browser',
  minify: true,
  write: false,
  legalComments: 'none',
});
const bundled = result.outputFiles[0].text;

const checkOnly = process.argv.includes('--check');
if (checkOnly) {
  const current = readFileSync(target, 'utf8');
  if (current !== bundled) {
    console.error(
      'frontend/vendor/superdough.js is out of sync with the pinned ' +
        'strudel packages; run `npm run vendor`.',
    );
    process.exit(1);
  }
  console.log('vendored superdough matches the pinned packages.');
} else {
  writeFileSync(target, bundled);
  console.log(`vendored superdough -> ${target}`);
}
