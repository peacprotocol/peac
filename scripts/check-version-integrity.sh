#!/bin/bash
# scripts/check-version-integrity.sh
# Verify all publishable packages have the correct version matching the tag

set -e

TAG_VERSION="${1:-}"

if [ -z "$TAG_VERSION" ]; then
  echo "Usage: $0 <version>"
  echo "Example: $0 0.9.18"
  exit 1
fi

echo "=== Checking version integrity against $TAG_VERSION ==="

# Get all public packages and their versions
MISMATCHES=""
CHECKED=0

for manifest in packages/*/package.json packages/rails/*/package.json packages/mappings/*/package.json packages/transport/*/package.json; do
  [ -f "$manifest" ] || continue

  IS_PRIVATE=$(node -e "const p = require('./$manifest'); console.log(p.private === true ? 'true' : 'false')")

  if [ "$IS_PRIVATE" = "false" ]; then
    PKG_NAME=$(node -e "const p = require('./$manifest'); console.log(p.name || '')")
    PKG_VERSION=$(node -e "const p = require('./$manifest'); console.log(p.version || '')")

    if [ -n "$PKG_NAME" ] && [ -n "$PKG_VERSION" ]; then
      CHECKED=$((CHECKED + 1))
      if [ "$PKG_VERSION" != "$TAG_VERSION" ]; then
        MISMATCHES="$MISMATCHES\n  $PKG_NAME: $PKG_VERSION (expected $TAG_VERSION)"
      fi
    fi
  fi
done

if [ -n "$MISMATCHES" ]; then
  echo "FAIL: Version mismatches found!"
  echo -e "$MISMATCHES"
  echo ""
  echo "All publishable packages must have version $TAG_VERSION"
  exit 1
else
  echo "OK: All $CHECKED public packages have version $TAG_VERSION"
fi
