# In Time — project instructions

_In Time_ visualises and sonifies the rhythm of the Swiss clock-face timetable
(Taktfahrplan). See `README.md` for the product vision. This file governs how we
build it.

## Repository structure

- `backend/` — the Django project (apps: `pipeline`, `travel`, `hotspots`,
  `frontend`).
- `frontend/` — `viz-core` + the five panels: static ES modules, **no bundler**,
  **p5 instance mode**. Node/npm is a dev-time tool only; the runtime stays
  bundler-free.
- `plan/` — the build plan and per-step specifications. **Local only**
  (git-ignored); it is working material, may be in German.

## Working model

Work is organised into packages (P0–P6) across three phases; see
**`plan/roadmap.md`** for build order, size and risk.

- **At the start of each phase**, work out the detailed specifications and
  **spec tests** for that phase (deeper than what `plan/` currently holds), then
  implement until the spec is met.
- Each work step has a spec under `plan/phase-*/` (preconditions, what to do,
  where it is expanded later). Background lives in `plan/referenz/`
  (architecture, data, UI).
- Phase 1 is a **vertical slice** (Herzschlag panel, rail-only, visual) that
  proves the whole stack early; Phase 2 broadens each package.

## Language

- **Everything checked into the repo is always English** — code, comments,
  filenames, README, docs.
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
- **JavaScript: untyped** (bundler-free) — hence the comment exception below.

### Comments

- **No method/docstring comments** — what a method does must be clear from its
  name, its I/O from argument names and types.
- Allowed: short, concise **class/module comments** (their responsibility).
- **Inline comments only** for a surprising mechanism the code cannot explain —
  and first weigh whether a refactor (a clearly named method or an explicitly
  named intermediate variable) describes it better. Hence extremely rare.
- **JS exception:** a comment on a JS method may state requirements on
  parameters when not self-evident from the parameter names.

### Structure

- **Object-oriented by default.** Classes may be omitted only for
  web-request-independent procedures (daily build jobs).

### Config & secrets

- **No hostname / real-infrastructure reference in the repo.** Everything via
  `.env` (dev) or Vault-injected env (prod). No hardcoded credentials.

### git commit messages

- First line is 50 characters or less, imperative style. Then a blank line.
  Remaining text should be wrapped at 72 characters.
- Body should only explain what for which reason (motivation, no duplicating git
  diff).
- brevity wins. Trivial commits do not require a body.

## Tooling

- **Backend:** ruff (format + lint) · mypy strict + django-stubs · pytest +
  pytest-django. Python via mise, dependencies via uv.
- **Frontend:** prettier + eslint · `node:test`. Tests target pure logic
  (projection, tile math, camera, sorting, time model); rendering is verified
  manually/visually.
- **Githooks:** `pre-commit` runs format + lint on every commit; **tests run in
  CI**, not in the hook.
- **Tests must be runnable with one argument-less command per language**; if
  several test kinds exist, a wrapper script combines them.

## Git workflow

- Never commit, push, or open PRs autonomously. After a meaningful step, show
  the diff and a proposed commit message, then wait.
- No AI attribution in commits or PRs.
