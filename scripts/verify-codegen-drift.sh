#!/usr/bin/env bash
# Verify that generated files match their source-of-truth specs.
# Runs codegen, formats output, then fails on dirty diff.
#
# Usage: bash scripts/verify-codegen-drift.sh
# Called by: CI (ci.yml), guard.sh, manual verification
#
# Exit code 0: all generated files are up to date
# Exit code 1: generated files are stale (run codegen to fix)

set -euo pipefail

DRIFT=0

# Registry codegen
echo "Checking registries codegen drift..."
pnpm exec tsx scripts/codegen-registries.ts > /dev/null 2>&1
pnpm exec prettier --write packages/kernel/src/registries.generated.ts > /dev/null 2>&1
if ! git diff --exit-code --quiet packages/kernel/src/registries.generated.ts 2>/dev/null; then
  echo "FAIL: registries.generated.ts is stale. Run: pnpm codegen:registries && pnpm exec prettier --write packages/kernel/src/registries.generated.ts"
  DRIFT=1
fi

# Error codegen
echo "Checking errors codegen drift..."
pnpm codegen:errors > /dev/null 2>&1
if ! git diff --exit-code --quiet packages/kernel/src/errors.generated.ts packages/kernel/src/error-categories.generated.ts 2>/dev/null; then
  echo "FAIL: errors.generated.ts is stale. Run: pnpm codegen:errors"
  DRIFT=1
fi

if [ "$DRIFT" -eq 1 ]; then
  echo "Codegen drift detected. Regenerate and commit."
  # Restore generated files to their committed state so this script
  # does not leave the working tree dirty. This is safe because the
  # script's purpose is detection, not modification. Developers who
  # intentionally ran codegen will have already staged or committed
  # the changes before running this check.
  git checkout -- packages/kernel/src/registries.generated.ts packages/kernel/src/errors.generated.ts packages/kernel/src/error-categories.generated.ts 2>/dev/null || true
  exit 1
fi

echo "All generated files are up to date."
