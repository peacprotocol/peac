#!/usr/bin/env bash
# scripts/check-version-coherence.sh
# Verify all workspace packages share the same version.
#
# All packages in the monorepo must have the same version number.
# This prevents partial publishes and version drift.

set -euo pipefail

echo "== Version coherence check =="

# Get root package version as reference
ROOT_VERSION=$(node -e "console.log(require('./package.json').version)")
echo "  Root version: $ROOT_VERSION"

bad=0
checked=0

for manifest in packages/*/package.json packages/rails/*/package.json packages/mappings/*/package.json packages/transport/*/package.json; do
  [ -f "$manifest" ] || continue

  PKG_NAME=$(node -e "const p = require('./$manifest'); console.log(p.name || '')")
  PKG_VERSION=$(node -e "const p = require('./$manifest'); console.log(p.version || '')")

  if [ -z "$PKG_NAME" ] || [ -z "$PKG_VERSION" ]; then
    continue
  fi

  checked=$((checked + 1))

  if [ "$PKG_VERSION" != "$ROOT_VERSION" ]; then
    echo "  FAIL: $PKG_NAME has version $PKG_VERSION (expected $ROOT_VERSION)"
    bad=1
  fi
done

# Also check apps
for manifest in apps/*/package.json; do
  [ -f "$manifest" ] || continue

  PKG_NAME=$(node -e "const p = require('./$manifest'); console.log(p.name || '')")
  PKG_VERSION=$(node -e "const p = require('./$manifest'); console.log(p.version || '')")

  if [ -z "$PKG_NAME" ] || [ -z "$PKG_VERSION" ]; then
    continue
  fi

  checked=$((checked + 1))

  if [ "$PKG_VERSION" != "$ROOT_VERSION" ]; then
    echo "  FAIL: $PKG_NAME has version $PKG_VERSION (expected $ROOT_VERSION)"
    bad=1
  fi
done

if [ "$bad" -eq 0 ]; then
  echo "  OK: All $checked packages have version $ROOT_VERSION"
else
  echo "  Version coherence check FAILED"
fi

exit $bad
