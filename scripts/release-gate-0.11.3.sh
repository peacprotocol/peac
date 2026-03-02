#!/usr/bin/env bash
set -euo pipefail

# Release Gate: v0.11.3
#
# Aggregates all v0.11.3 quality gates into a single script.
# Must pass before tagging v0.11.3.
#
# Usage: bash scripts/release-gate-0.11.3.sh

echo "=== PEAC v0.11.3 Release Gate ==="
echo ""

FAILED=0

run_gate() {
  local name="$1"
  shift
  echo -n "  [$name] "
  if "$@" > /dev/null 2>&1; then
    echo "PASS"
  else
    echo "FAIL"
    FAILED=$((FAILED + 1))
  fi
}

# Gate 1: Build
echo "--- Build & Lint ---"
run_gate "build" pnpm build
run_gate "lint" pnpm lint
run_gate "typecheck" pnpm typecheck:core
run_gate "test" pnpm test

# Gate 2: Guards
echo ""
echo "--- Guards ---"
run_gate "guard" bash scripts/guard.sh
run_gate "planning-leak" bash scripts/check-planning-leak.sh
run_gate "format" pnpm format:check

# Gate 3: Version coherence
echo ""
echo "--- Version Coherence ---"
run_gate "version-sync" node scripts/check-version-sync.mjs

# Gate 4: Codegen freshness
# Run codegen-errors.ts and verify ALL generated files are up to date.
echo ""
echo "--- Codegen Freshness ---"
pnpm exec tsx scripts/codegen-errors.ts > /dev/null 2>&1
pnpm exec prettier --write packages/kernel/src/errors.generated.ts packages/kernel/src/error-categories.generated.ts > /dev/null 2>&1
CODEGEN_FILES="packages/kernel/src/errors.generated.ts packages/kernel/src/error-categories.generated.ts"
CODEGEN_STALE=0
for gf in $CODEGEN_FILES; do
  echo -n "  [$(basename "$gf")] "
  if [ ! -f "$gf" ]; then
    echo "FAIL (file not found)"
    CODEGEN_STALE=1
  elif git diff --exit-code --quiet "$gf" 2>/dev/null; then
    echo "PASS"
  else
    echo "FAIL (stale)"
    CODEGEN_STALE=1
  fi
done
if [ "$CODEGEN_STALE" -ne 0 ]; then
  echo "  Re-run: pnpm exec tsx scripts/codegen-errors.ts"
  FAILED=$((FAILED + 1))
fi

# Gate 5: No-network guard (DD-55 SSRF hardening)
echo ""
echo "--- No-Network Guard ---"
run_gate "no-network" node scripts/check-no-network.mjs

# Gate 6: Evidence pack builds
echo ""
echo "--- Evidence Pack ---"
run_gate "evidence-pack" node scripts/build-submission-pack.mjs

# Summary
echo ""
echo "=== Results ==="
if [ "$FAILED" -eq 0 ]; then
  echo "All gates PASSED. Ready to tag v0.11.3."
  exit 0
else
  echo "$FAILED gate(s) FAILED. Fix before tagging."
  exit 1
fi
