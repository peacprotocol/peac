#!/usr/bin/env bash
# Guard against hidden/bidi Unicode characters in source files.
# Delegates to sanitize-unicode.mjs which uses `git ls-files` as
# the single source of truth (no hardcoded directory list).

set -euo pipefail

echo "Checking for hidden/bidi Unicode characters..."
node scripts/sanitize-unicode.mjs
