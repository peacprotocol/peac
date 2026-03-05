#!/usr/bin/env bash
set -euo pipefail

# Consolidated Release Gate Runner
#
# Runs all quality gates for a PEAC release and produces a JSON report.
#
# Usage:
#   bash scripts/release/run-gates.sh --target preview
#   bash scripts/release/run-gates.sh --target stable
#   bash scripts/release/run-gates.sh --target preview --write-release-artifacts
#
# Flags:
#   --target preview|stable   Gate profile (required)
#   --write-release-artifacts  Write JSON report to docs/releases/gate-report.json
#
# Exit codes:
#   0  All gates passed
#   1  One or more gates failed

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$REPO_ROOT"

TARGET=""
WRITE_ARTIFACTS=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --target)
      TARGET="$2"
      shift 2
      ;;
    --write-release-artifacts)
      WRITE_ARTIFACTS=true
      shift
      ;;
    *)
      echo "Unknown option: $1" >&2
      echo "Usage: $0 --target preview|stable [--write-release-artifacts]" >&2
      exit 1
      ;;
  esac
done

if [[ -z "$TARGET" ]]; then
  echo "Error: --target is required (preview or stable)" >&2
  exit 1
fi

if [[ "$TARGET" != "preview" && "$TARGET" != "stable" ]]; then
  echo "Error: --target must be 'preview' or 'stable'" >&2
  exit 1
fi

VERSION=$(node -p "require('./package.json').version")

echo "=== PEAC Release Gate: $TARGET (v$VERSION) ==="
echo ""

FAILED=0
TOTAL=0
GATES_JSON="[]"

run_gate() {
  local name="$1"
  shift
  local start_ms
  start_ms=$(date +%s%3N 2>/dev/null || python3 -c 'import time; print(int(time.time()*1000))')
  TOTAL=$((TOTAL + 1))

  echo -n "  [$name] "
  if "$@" > /dev/null 2>&1; then
    local end_ms
    end_ms=$(date +%s%3N 2>/dev/null || python3 -c 'import time; print(int(time.time()*1000))')
    local duration=$((end_ms - start_ms))
    echo "PASS (${duration}ms)"
    GATES_JSON=$(echo "$GATES_JSON" | node -e "
      const g = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
      g.push({name:'$name',status:'passed',duration_ms:$duration});
      process.stdout.write(JSON.stringify(g));
    ")
  else
    local end_ms
    end_ms=$(date +%s%3N 2>/dev/null || python3 -c 'import time; print(int(time.time()*1000))')
    local duration=$((end_ms - start_ms))
    echo "FAIL (${duration}ms)"
    FAILED=$((FAILED + 1))
    GATES_JSON=$(echo "$GATES_JSON" | node -e "
      const g = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
      g.push({name:'$name',status:'failed',duration_ms:$duration});
      process.stdout.write(JSON.stringify(g));
    ")
  fi
}

# --- Build & Lint ---
echo "--- Build & Lint ---"
run_gate "build" pnpm build
run_gate "lint" pnpm lint
run_gate "typecheck" pnpm typecheck:core
run_gate "test" pnpm test

# --- Guards ---
echo ""
echo "--- Guards ---"
run_gate "guard" bash scripts/guard.sh
run_gate "planning-leak" bash scripts/check-planning-leak.sh
run_gate "format" pnpm format:check

# --- Architecture ---
echo ""
echo "--- Architecture ---"
run_gate "layer-boundary" bash scripts/check-layer-boundaries.sh

# --- Version Coherence ---
echo ""
echo "--- Version Coherence ---"
run_gate "version-coherence" node scripts/check-version-sync.mjs

# --- Codegen Freshness ---
echo ""
echo "--- Codegen Freshness ---"
pnpm exec tsx scripts/codegen-errors.ts > /dev/null 2>&1 || true
pnpm exec prettier --write packages/kernel/src/errors.generated.ts packages/kernel/src/error-categories.generated.ts > /dev/null 2>&1 || true
CODEGEN_FILES="packages/kernel/src/errors.generated.ts packages/kernel/src/error-categories.generated.ts"
CODEGEN_OK=true
for gf in $CODEGEN_FILES; do
  if [ ! -f "$gf" ] || ! git diff --exit-code --quiet "$gf" 2>/dev/null; then
    CODEGEN_OK=false
    break
  fi
done

TOTAL=$((TOTAL + 1))
CODEGEN_START=$(date +%s%3N 2>/dev/null || python3 -c 'import time; print(int(time.time()*1000))')
if $CODEGEN_OK; then
  echo "  [codegen-fresh] PASS"
  GATES_JSON=$(echo "$GATES_JSON" | node -e "
    const g = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
    g.push({name:'codegen-fresh',status:'passed',duration_ms:0});
    process.stdout.write(JSON.stringify(g));
  ")
else
  echo "  [codegen-fresh] FAIL (stale; re-run: pnpm exec tsx scripts/codegen-errors.ts)"
  FAILED=$((FAILED + 1))
  GATES_JSON=$(echo "$GATES_JSON" | node -e "
    const g = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
    g.push({name:'codegen-fresh',status:'failed',duration_ms:0});
    process.stdout.write(JSON.stringify(g));
  ")
fi

# --- No-Network Guard ---
echo ""
echo "--- No-Network Guard ---"
run_gate "no-network" node scripts/check-no-network.mjs

# --- Wire 0.1 Frozen ---
echo ""
echo "--- Wire 0.1 Frozen ---"
TOTAL=$((TOTAL + 1))
echo -n "  [wire-01-frozen] "
WIRE01_DIFF=$(git diff origin/main -- packages/schema/src/validators.ts packages/schema/src/attestation-receipt.ts 2>/dev/null || true)
if [ -z "$WIRE01_DIFF" ]; then
  echo "PASS"
  GATES_JSON=$(echo "$GATES_JSON" | node -e "
    const g = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
    g.push({name:'wire-01-frozen',status:'passed',duration_ms:0});
    process.stdout.write(JSON.stringify(g));
  ")
else
  echo "FAIL (Wire 0.1 files modified)"
  FAILED=$((FAILED + 1))
  GATES_JSON=$(echo "$GATES_JSON" | node -e "
    const g = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
    g.push({name:'wire-01-frozen',status:'failed',duration_ms:0});
    process.stdout.write(JSON.stringify(g));
  ")
fi

# --- Wire 0.2 Conformance ---
echo ""
echo "--- Wire 0.2 Conformance ---"
run_gate "wire-02-conformance" pnpm test -- tests/conformance/wire-02.spec.ts

# --- Release State Coherence ---
echo ""
echo "--- Release State Coherence ---"
if [ -f scripts/check-release-state-coherence.sh ]; then
  run_gate "release-state-coherence" bash scripts/check-release-state-coherence.sh
else
  echo "  [release-state-coherence] SKIP (script not found)"
fi

# --- Stable-only gates (DD-90 stubs) ---
if [[ "$TARGET" == "stable" ]]; then
  echo ""
  echo "--- DD-90 Adoption Gates (stable only) ---"

  for stub_gate in "adoption-evidence" "perf-benchmarks" "fuzz-suite" "ssrf-suite"; do
    TOTAL=$((TOTAL + 1))
    echo "  [$stub_gate] FAIL (not implemented: DD-90 requires implementation before stable release)"
    FAILED=$((FAILED + 1))
    GATES_JSON=$(echo "$GATES_JSON" | node -e "
      const g = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
      g.push({name:'$stub_gate',status:'failed',duration_ms:0});
      process.stdout.write(JSON.stringify(g));
    ")
  done
fi

# --- Summary ---
echo ""
echo "=== Results ==="
PASSED=$((TOTAL - FAILED))
echo "Total: $TOTAL | Passed: $PASSED | Failed: $FAILED"

TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
REPORT_JSON=$(node -e "
  const gates = JSON.parse(process.argv[1]);
  const report = {
    target: '$TARGET',
    timestamp: '$TIMESTAMP',
    version: '$VERSION',
    gates: gates,
    summary: { total: $TOTAL, passed: $PASSED, failed: $FAILED }
  };
  process.stdout.write(JSON.stringify(report, null, 2));
" "$GATES_JSON")

if $WRITE_ARTIFACTS; then
  echo "$REPORT_JSON" > docs/releases/gate-report.json
  echo ""
  echo "Gate report written to docs/releases/gate-report.json"
fi

if [ "$FAILED" -eq 0 ]; then
  echo ""
  echo "All gates PASSED. Ready to tag v$VERSION."
  exit 0
else
  echo ""
  echo "$FAILED gate(s) FAILED. Fix before tagging."
  exit 1
fi
