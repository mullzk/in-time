#!/usr/bin/env bash
# Runs every formatter, linter and type checker for both languages. Without
# arguments it only checks (CI / pre-commit verification); with --fix it applies
# formatting and safe lint autofixes. Biome covers js/json/css; prettier covers
# md/yaml and the Django templates, whose tag syntax Biome's HTML parser cannot
# read. mypy only ever reports, so it runs last: --fix applies every fix it can
# before a type error can abort the run.
set -euo pipefail
cd "$(dirname "$0")/.."

if [ "${1:-}" = "--fix" ]; then
  uv run ruff format .
  uv run ruff check --fix .
  npx biome check --write .
  npx prettier --write '**/*.{md,yml,yaml}' 'backend/**/templates/**/*.html'
  uv run mypy backend
else
  uv run ruff format --check .
  uv run ruff check .
  npx biome check .
  npx prettier --check '**/*.{md,yml,yaml}' 'backend/**/templates/**/*.html'
  uv run mypy backend
fi
