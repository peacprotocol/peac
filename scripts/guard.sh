#!/usr/bin/env bash
# Guard script for v0.9.14 safety checks
set -euo pipefail
bad=0

echo "== forbid dist imports =="
if git grep -n "packages/.*/dist" -- ':!node_modules' ':!scripts/guard.sh' ':!archive/**' \
  | grep -vE '^(\.github/workflows/nightly\.yml)' | grep .; then
  bad=1
else
  echo "OK"
fi

echo "== forbid .ts in ESM imports =="
git grep -nE "from ['\"][^'\"]+\.ts['\"]" -- 'packages/**/*.ts' ':!node_modules' && bad=1 || echo "OK"

echo "== forbid v0914 fragments =="
git ls-files | grep -E 'v0?914|v0914' && bad=1 || echo "OK"

echo "== header & typ must be new =="
git grep -nE "peac-version|application/peac-receipt\+jws" -- '**/*.{md,ts,js,json,yml}' ':!node_modules' ':!archive/**' \
  && bad=1 || echo "OK"

echo "== forbid peac.dev domain =="
# Fail if any peac.dev reference appears outside allowed migration docs
DOCS_MIGRATION_ALLOW='^(docs/migration|CHANGELOG\.md)'
if git grep -nE 'https?://([a-z0-9.-]*\.)?peac\.dev\b' -- ':!node_modules' ':!archive/**' \
  | grep -vE "$DOCS_MIGRATION_ALLOW" | grep .; then
  bad=1
else
  echo "OK"
fi

# Require https for peacprotocol.org
echo "== peacprotocol.org must be https =="
if git grep -nE 'http://peacprotocol\.org\b' -- ':!node_modules' ':!archive/**' | grep .; then
  bad=1
else
  echo "OK"
fi

echo "== field regressions (typos) =="
# Catch common misspellings of 'receipt' and legacy field names (intentionally spelled wrong below)
LEGACY_FIELD_FILES='^(ex/|profiles/|scripts/guard\.sh|CHANGELOG\.md|docs/(migration/|MIGRATION_|PEAC_NORMATIVE_DECISIONS_LOG\.md|PEAC_v0\.9\.15_ACTUAL_SCOPE\.md|interop\.md))'
if git grep -nE '\bissued_at\b|payment\.scheme|peacrece?i?e?pt(s)?\b' -- ':!node_modules' ':!archive/**' \
  | grep -vE "$LEGACY_FIELD_FILES" | grep .; then
  bad=1
else
  echo "OK"
fi

echo "== forbid internal notes =="
DOCS_ALLOW='^(docs/peip/|docs/peips\.md|pnpm-lock\.yaml|scripts/guard\.sh)'
if git grep -nE 'TODO|FIXME|HACK|XXX|@ts-ignore' -- ':!node_modules' ':!archive/**' \
  | grep -vE "$DOCS_ALLOW" | grep .; then
  bad=1
else
  echo "OK"
fi

echo "== forbid disabled typechecks =="
if git grep -nE '"typecheck":\s*"echo .*temporarily disabled' -- 'apps/**/package.json' 'packages/**/package.json' | grep .; then
  bad=1
else
  echo "OK"
fi

echo "== forbid legacy media type =="
if git grep -n 'application/peac-receipt+jws' -- ':!node_modules' ':!scripts/guard.sh' | grep -vE '^archive/'; then
  bad=1
else
  echo "OK"
fi

echo "== forbid empty smoke tests =="
if grep -RIl "Zero-BC v0.9.14: Test disabled" test/ tests/ 2>/dev/null | grep .; then
  echo "FAIL: Found disabled smoke tests - archive them properly"
  bad=1
else
  echo "OK"
fi

echo "== forbid imports from archive =="
if git grep -nE "from ['\"]/.*archive/|require\(['\"]/.*archive/" -- ':!node_modules' | grep .; then
  bad=1
else
  echo "OK"
fi

echo "== forbid relative imports to dist =="
if git grep -nE "\.\./\.\./packages/.*/dist/" -- ':!node_modules' ':!archive/**' | grep .; then
  bad=1
else
  echo "OK"
fi

echo "== forbid npm invocations =="
# Allow npm in README.md for end-user install instructions (pnpm is recommended, npm is fallback)
if git grep -nE '\bnpm (run|ci|install|pack|publish)\b' -- ':!node_modules' ':!archive/**' | grep -vE '^(IMPLEMENTATION_STATUS\.md|README\.md):' | grep .; then
  bad=1
else
  echo "OK"
fi

echo "== forbid foreign lockfiles =="
if [ -f package-lock.json ] || [ -f yarn.lock ]; then
  echo "FAIL: found non-pnpm lockfile"; bad=1
else
  echo "OK"
fi

exit $bad