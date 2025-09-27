#!/usr/bin/env bash
set -euo pipefail
bad=0

# ignore known-legacy consumers
IGNORE='^(test/smoke/|tests/smoke/|\.github/workflows/nightly\.yml)'

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
# Ignore legacy files that still use old field names
LEGACY_FIELD_FILES='^(ex/|packages/core/src/(compact|validators)\.ts|profiles/|scripts/guard\.sh)'
if git grep -nE '\bissued_at\b|payment\.rail|peacreceiept|peacreceiepts' -- ':!node_modules' | grep -vE "$LEGACY_FIELD_FILES" | grep .; then
  bad=1
else
  echo "OK"
fi

exit $bad