#!/usr/bin/env bash
set -euo pipefail
bad=0

echo "== forbid dist imports =="
git grep -n "packages/.*/dist" -- ':!node_modules' && bad=1 || echo "OK"

echo "== forbid .ts in ESM imports =="
git grep -nE "from ['\"][^'\"]+\.ts['\"]" -- 'packages/**/*.ts' ':!node_modules' && bad=1 || echo "OK"

echo "== forbid v0914 fragments =="
git ls-files | grep -E 'v0?914|v0914' && bad=1 || echo "OK"

echo "== header & typ must be new =="
git grep -nE "peac-version|application/peac-receipt\+jws" -- '**/*.{md,ts,js,json,yml}' ':!node_modules' \
  && bad=1 || echo "OK"

echo "== field regressions =="
git grep -nE '\bissued_at\b|payment\.rail|peacreceiept|peacreceiepts' -- ':!node_modules' \
  && bad=1 || echo "OK"

exit $bad