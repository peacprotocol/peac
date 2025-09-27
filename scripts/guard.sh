#!/usr/bin/env bash
# Guard script for v0.9.14 safety checks
# TODO: Remove legacy ignores by 2025-10-15 after migrating test/smoke to @peac/core imports
set -euo pipefail
bad=0

# ignore known-legacy consumers (temporary - see TODO above)
IGNORE='^(test/smoke/|tests/smoke/|\.github/workflows/nightly\.yml|scripts/assert-core-exports\.mjs)'

echo "== forbid dist imports =="
if git grep -n "packages/.*/dist" -- ':!node_modules' ':!scripts/guard.sh' | grep -vE "$IGNORE" | grep .; then
  bad=1
else
  echo "OK"
fi

echo "== forbid .ts in ESM imports =="
git grep -nE "from ['\"][^'\"]+\.ts['\"]" -- 'packages/**/*.ts' ':!node_modules' && bad=1 || echo "OK"

echo "== forbid v0914 fragments =="
git ls-files | grep -E 'v0?914|v0914' && bad=1 || echo "OK"

echo "== header & typ must be new =="
git grep -nE "peac-version|application/peac-receipt\+jws" -- '**/*.{md,ts,js,json,yml}' ':!node_modules' \
  && bad=1 || echo "OK"

echo "== field regressions =="
# Ignore legacy files that still use old field names and docs that explain the change
LEGACY_FIELD_FILES='^(ex/|packages/core/src/(compact|validators)\.ts|profiles/|scripts/guard\.sh|CHANGELOG\.md)'
if git grep -nE '\bissued_at\b|payment\.rail|peacreceiept|peacreceiepts' -- ':!node_modules' | grep -vE "$LEGACY_FIELD_FILES" | grep .; then
  bad=1
else
  echo "OK"
fi

exit $bad