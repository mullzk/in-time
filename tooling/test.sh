#!/usr/bin/env bash
# Combining wrapper: runs both languages' test suites with one command.
set -euo pipefail
cd "$(dirname "$0")/.."

uv run pytest
npm test
