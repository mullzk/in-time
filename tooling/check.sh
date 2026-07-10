#!/usr/bin/env bash
# Runs every formatter and linter for both languages. Without arguments it only
# checks (CI / pre-commit verification); with --fix it applies formatting and
# safe lint autofixes. Biome covers js/json/css; prettier covers md/yaml.
set -euo pipefail
cd "$(dirname "$0")/.."

if [ "${1:-}" = "--fix" ]; then
  uv run ruff format .
  uv run ruff check --fix .
  npx biome check --write .
  npx prettier --write '**/*.{md,yml,yaml}'
else
  uv run ruff format --check .
  uv run ruff check .
  npx biome check .
  npx prettier --check '**/*.{md,yml,yaml}'
fi
