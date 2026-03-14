#!/usr/bin/env bash
# Verify that generated files match their source-of-truth specs.
#
# Strategy: stash the current content of generated files, run codegen +
# format, compare against the stashed originals, then restore originals.
# This avoids git-checkout side effects and works on both clean and dirty
# working trees.
#
# Usage: bash scripts/verify-codegen-drift.sh
# Called by: CI (ci.yml), local manual verification
#
# Exit code 0: all generated files are up to date
# Exit code 1: generated files are stale (run codegen to fix)

set -euo pipefail

GEN_REGISTRIES="packages/kernel/src/registries.generated.ts"
GEN_ERRORS="packages/kernel/src/errors.generated.ts"
GEN_ERROR_CATS="packages/kernel/src/error-categories.generated.ts"

# Save originals to temp files (non-destructive: never modifies working tree)
TMPDIR_DRIFT=$(mktemp -d)
trap 'rm -rf "$TMPDIR_DRIFT"' EXIT

cp "$GEN_REGISTRIES" "$TMPDIR_DRIFT/registries.orig.ts"
cp "$GEN_ERRORS" "$TMPDIR_DRIFT/errors.orig.ts"
cp "$GEN_ERROR_CATS" "$TMPDIR_DRIFT/error-categories.orig.ts"

DRIFT=0

# Registry codegen
echo "Checking registries codegen drift..."
pnpm exec tsx scripts/codegen-registries.ts > /dev/null 2>&1
pnpm exec prettier --write "$GEN_REGISTRIES" > /dev/null 2>&1
if ! diff -q "$TMPDIR_DRIFT/registries.orig.ts" "$GEN_REGISTRIES" > /dev/null 2>&1; then
  echo "FAIL: registries.generated.ts is stale."
  echo "  Run: pnpm codegen:registries && pnpm exec prettier --write $GEN_REGISTRIES"
  DRIFT=1
fi
# Restore original
cp "$TMPDIR_DRIFT/registries.orig.ts" "$GEN_REGISTRIES"

# Error codegen
echo "Checking errors codegen drift..."
pnpm codegen:errors > /dev/null 2>&1
if ! diff -q "$TMPDIR_DRIFT/errors.orig.ts" "$GEN_ERRORS" > /dev/null 2>&1; then
  echo "FAIL: errors.generated.ts is stale."
  echo "  Run: pnpm codegen:errors"
  DRIFT=1
fi
if ! diff -q "$TMPDIR_DRIFT/error-categories.orig.ts" "$GEN_ERROR_CATS" > /dev/null 2>&1; then
  echo "FAIL: error-categories.generated.ts is stale."
  echo "  Run: pnpm codegen:errors"
  DRIFT=1
fi
# Restore originals
cp "$TMPDIR_DRIFT/errors.orig.ts" "$GEN_ERRORS"
cp "$TMPDIR_DRIFT/error-categories.orig.ts" "$GEN_ERROR_CATS"

if [ "$DRIFT" -eq 1 ]; then
  echo "Codegen drift detected. Regenerate and commit."
  exit 1
fi

echo "All generated files are up to date."
