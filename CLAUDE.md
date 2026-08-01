# All in Time — project instructions

_All in Time_ visualises and sonifies the rhythm of the Swiss clock-face
timetable (Taktfahrplan). See `README.md` for the product vision. This file
governs how we build it.

## Repository structure

- `backend/` — the Django project. Built: `pipeline` (build jobs, `BuildRun`)
  and `web` (pages + config/station endpoints). Planned: `travel` (live routing)
  and `hotspots` (aggregation). The browser-facing delivery app is `web`, not
  `frontend`, so its name does not collide with the `frontend/` client tree
  below.
- `frontend/` — `viz-core` + the five panels: static ES modules, **no bundler**,
  **p5 instance mode**. Node/npm is a dev-time tool only; the runtime stays
  bundler-free. `frontend/vendor/` holds vendored runtime dependencies (see
  _Vendoring_).
- `tooling/` — the dev-time scripts: `check.sh` (format + lint), `test.sh` (both
  test suites), the vendoring scripts.
- `docs/` — documentation that ships with the repo, e.g. `performance.md`.
- `data/` — the local data directory (git-ignored): source archives and the
  published day artifacts.
- `plan/` — the build plan and per-step specifications, including `debt.md` for
  consciously accepted debt. **Local only** (git-ignored); it is working
  material, may be in German.

## Working model

Work is organised into packages (P0–P6) across three phases; see
**`plan/roadmap.md`** for build order, size and risk.

- **At the start of each phase**, work out the detailed specifications and
  **spec tests** for that phase (deeper than what `plan/` currently holds), then
  implement until the spec is met.
- Each work step has a spec under `plan/phase-*/` (preconditions, what to do,
  where it is expanded later). Background lives in `plan/referenz/`
  (architecture, data, UI).
- Phase 1 is a **vertical slice** (Takt panel, rail-only, visual) that proves
  the whole stack early; Phase 2 broadens each package.

## Language

- **Everything checked into the repo is always English** — code, comments,
  filenames, README, docs.
- **Exception: user-visible text is German** — UI labels, messages, the info
  modal. Follow the existing wording rather than translating anything.
- **PRs and commit messages: always English.** GitHub issues may be German
  (English is fine too).
- Only local-only, git-ignored material (`plan/`) may be German.

## Coding guidelines

### Naming

- Names are self-explanatory, **no developer abbreviations**. Domain
  abbreviations (LV95, GTFS) are fine; unclearer ones (e.g. CSA) are spelled
  out. Prefer a long name every time over any mental effort.
- **Each function does exactly one thing**, described in its name.
- Iterate with language-idiomatic patterns (`forEach`/`map`/`reduce`), never
  C-style index loops.

### Typing

- **Python: fully typed** (signatures carry input/output). Tooling: mypy strict
  - django-stubs + ruff annotation rules.
- **Python tests: typed as far as trivially possible.** Once mocks would force
  us out of the type system into bespoke mock-only types, typing may be dropped.
  The ruff `ANN` ignore for tests (and migrations) reflects this.
- **JavaScript: untyped** (bundler-free) — hence the comment exception below.

### Comments

- A module's or class's **responsibility** goes in a **docstring** (not a `#`
  comment). Keep it short; **trivial modules/classes need none**.
- **Methods carry no docstring** unless an essential characteristic of their
  meaning/motivation cannot be expressed in the signature (name + typed
  arguments/return). What a method does must otherwise be clear from its name,
  its I/O from argument names and types.
- **No prototype/porting references** in code comments or docstrings ("ported
  from …", tool names of throwaway prototypes) — that lineage belongs in the
  plan, not the shipped code.
- **Inline comments only** for a surprising mechanism the code cannot explain —
  and first weigh whether a refactor (a clearly named method or an explicitly
  named intermediate variable) describes it better. Hence extremely rare.
- **JS exception:** a comment on a JS method may state requirements on
  parameters when not self-evident from the parameter names.

### Structure

- **Object-oriented by default.** Classes may be omitted only for
  web-request-independent procedures (daily build jobs).

### CSS

- **SMACSS**, delivered as static files — **no inline `<style>`, no CSS-in-JS**.
  Layers: **base** (reset, element defaults, design tokens as `:root` custom
  properties), **layout** (`l-` regions), **module** (one component per file,
  e.g. the cockpit), **state** (`is-`). Modules reference tokens, never raw
  colours/spacing.
- **Delivery:** plain CSS under `frontend/styles/`, collected by
  `collectstatic`, linked via `{% static %}`. A base template carries the global
  layers; each page links only the modules it uses. Bundler-free like the JS;
  biome formats and lints it.

### Config & secrets

- **No hostname / real-infrastructure reference in the repo.** Everything via
  `.env` (dev) or Vault-injected env (prod). No hardcoded credentials.

### Artifacts

- Every **published pipeline artifact** is written with `.gz` and `.br` sidecars
  so the reverse proxy serves it pre-compressed (gzip/brotli static), never
  recompressing per request. Keep this when adding artifacts (e.g. per-mode
  blobs). Rationale in the README.
- Every **pipeline feature is logged in `docs/performance.md`** on real data —
  input size, processing time, output size. Update it when a feature lands and
  when its numbers move.

### Vendoring

- The client loads from **no third-party host**, so every runtime dependency is
  vendored under `frontend/vendor/` by a script in `tooling/`, pinned in
  `package.json` and regenerated with `npm run vendor`. CI verifies the
  checked-in copies with `npm run vendor:check` — never hand-edit a vendored
  file.

### git commit messages

- First line is 50 characters or less, imperative style. Then a blank line.
  Remaining text should be wrapped at 72 characters.
- Body should only explain what for which reason (motivation, no duplicating git
  diff).
- brevity wins. Trivial commits do not require a body.

## Tooling

- **Backend:** ruff (format + lint) · mypy strict + django-stubs · pytest +
  pytest-django. Python via mise, dependencies via uv.
- **Frontend:** biome (format + lint for js/json/css) · prettier (markdown, yaml
  and the Django templates, whose tag syntax biome cannot parse) · `node:test`.
- **One command per job:** `tooling/check.sh` runs every formatter and linter
  (`--fix` applies), `tooling/test.sh` runs both test suites.
- **Githooks:** `pre-commit` runs format + lint on every commit; **tests run in
  CI**, not in the hook.

### Testing

- Tests target **pure logic** (projection, tile math, camera, search ranking,
  time model, blob reading); rendering is verified manually/visually.
- **Two tiers for pipeline features:** synthetic fixtures run everywhere and in
  CI; tests on the real GDB/GTFS carry `@pytest.mark.realdata` and are skipped
  unless their path env is set.
- **Cross-language formats are pinned by golden fixtures:** the Python blob
  writer generates them, the JS reader's tests consume them, so writer and
  reader cannot drift apart unnoticed.

## Git workflow

- Never commit, push, or open PRs autonomously. After a meaningful step, show
  the diff and a proposed commit message, then wait.
- No AI attribution in commits or PRs.
