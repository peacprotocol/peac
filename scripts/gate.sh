#!/usr/bin/env bash
# scripts/gate.sh
# Single source of truth for all quality gates.
#
# Both CI (.github/workflows/ci.yml) and the pre-push hook (.githooks/pre-push)
# call this script. If a gate check lives only in CI or only in a hook, it WILL
# drift. Add all mechanical checks here.
#
# Usage:
#   bash scripts/gate.sh          # full gate (CI parity)
#   bash scripts/gate.sh --fast   # skip slow checks (audit, lockfile)
#
# Environment:
#   PEAC_FAST=1   same as --fast

set -euo pipefail

FAST="${PEAC_FAST:-0}"
if [ "${1:-}" = "--fast" ]; then
  FAST=1
fi

bad=0
run_check() {
  local label="$1"
  shift
  echo "== $label =="
  if "$@"; then
    :
  else
    bad=1
  fi
}

# --- Format ---
run_check "format" pnpm format:check

# --- Lint ---
run_check "lint" pnpm lint

# --- TypeScript ---
run_check "typecheck (core)" pnpm typecheck:core

# --- Build ---
run_check "build" pnpm build

# --- Tests ---
run_check "test" pnpm test

# --- Guard (safety invariants) ---
if [ "$FAST" = "1" ]; then
  echo "== guard (fast) =="
  PEAC_FAST=1 run_check "guard" bash scripts/guard.sh
else
  run_check "guard" bash scripts/guard.sh
fi

# --- Planning leak ---
run_check "planning leak" bash scripts/check-planning-leak.sh

# --- Summary ---
echo ""
if [ "$bad" -eq 0 ]; then
  echo "All gates passed."
else
  echo "GATE FAILED: one or more checks above failed."
fi

exit $bad
