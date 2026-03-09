#!/usr/bin/env bash
set -euo pipefail

# Release Gate: v0.12.0-preview.1
#
# Aggregates all v0.12.0-preview.1 quality gates into a single script.
# Must pass before tagging v0.12.0-preview.1.
#
# Usage: bash scripts/release-gate-0.12.0-preview.1.sh

echo "=== PEAC v0.12.0-preview.1 Release Gate ==="
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

# Gate 1-4: Build
echo "--- Build & Lint ---"
run_gate "build" pnpm build
run_gate "lint" pnpm lint
run_gate "typecheck" pnpm typecheck:core
run_gate "test" pnpm test

# Gate 5-7: Guards
echo ""
echo "--- Guards ---"
run_gate "guard" bash scripts/guard.sh
if [ -f scripts/check-planning-leak.sh ]; then
  run_gate "planning-leak" bash scripts/check-planning-leak.sh
else
  echo "  SKIP planning-leak (local-only script)"
fi
run_gate "format" pnpm format:check

# Gate 8: Layer boundary
echo ""
echo "--- Architecture ---"
run_gate "layer-boundary" bash scripts/check-layer-boundaries.sh

# Gate 9: Version coherence
echo ""
echo "--- Version Coherence ---"
run_gate "version-coherence" node scripts/check-version-sync.mjs

# Gate 10: Codegen freshness
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

# Gate 11: No-network guard (DD-55 SSRF hardening)
echo ""
echo "--- No-Network Guard ---"
run_gate "no-network" node scripts/check-no-network.mjs

# Gate 12: Wire 0.1 frozen
echo ""
echo "--- Wire 0.1 Frozen ---"
echo -n "  [wire-01-frozen] "
WIRE01_DIFF=$(git diff origin/main -- packages/schema/src/validators.ts packages/schema/src/attestation-receipt.ts 2>/dev/null || true)
if [ -z "$WIRE01_DIFF" ]; then
  echo "PASS"
else
  echo "FAIL (Wire 0.1 files modified)"
  FAILED=$((FAILED + 1))
fi

# Gate 13: Wire 0.2 conformance
echo ""
echo "--- Wire 0.2 Conformance ---"
run_gate "wire-02-conformance" pnpm test -- tests/conformance/wire-02.spec.ts

# Gate 14: Deterministic conformance
echo ""
echo "--- Deterministic Conformance ---"
echo -n "  [deterministic] "
RUN1=$(pnpm test -- tests/conformance/wire-02.spec.ts 2>&1 | grep -E '^\s*(PASS|FAIL|ok|not ok|Tests)' | sort || true)
RUN2=$(pnpm test -- tests/conformance/wire-02.spec.ts 2>&1 | grep -E '^\s*(PASS|FAIL|ok|not ok|Tests)' | sort || true)
if [ "$RUN1" = "$RUN2" ]; then
  echo "PASS"
else
  echo "FAIL (non-deterministic test output)"
  FAILED=$((FAILED + 1))
fi

# Summary
echo ""
echo "=== Results ==="
if [ "$FAILED" -eq 0 ]; then
  echo "All gates PASSED. Ready to tag v0.12.0-preview.1."
  exit 0
else
  echo "$FAILED gate(s) FAILED. Fix before tagging."
  exit 1
fi
