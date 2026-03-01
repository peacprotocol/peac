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
echo ""
echo "--- Codegen Freshness ---"
echo -n "  [codegen-errors] "
pnpm exec tsx scripts/codegen-errors.ts > /dev/null 2>&1
if git diff --exit-code --quiet packages/kernel/src/errors.generated.ts 2>/dev/null; then
  echo "PASS"
else
  echo "FAIL (generated files are stale)"
  FAILED=$((FAILED + 1))
fi

# Gate 5: No-network guard in observation examples (DD-55 SSRF hardening)
# Content-signals and a2a-gateway examples must not use fetch();
# all content must be pre-fetched. Server/webhook examples are exempt.
echo ""
echo "--- No-Network Guard ---"
echo -n "  [examples-no-fetch] "
NO_FETCH_EXAMPLES="examples/content-signals examples/a2a-gateway-pattern examples/hello-world"
FETCH_VIOLATIONS=""
for dir in $NO_FETCH_EXAMPLES; do
  if [ -d "$dir" ]; then
    FOUND=$(grep -rn '\bfetch\s*(' "$dir" --include='*.ts' 2>/dev/null || true)
    if [ -n "$FOUND" ]; then
      FETCH_VIOLATIONS="$FETCH_VIOLATIONS
$FOUND"
    fi
  fi
done
if [ -n "$FETCH_VIOLATIONS" ]; then
  echo "FAIL"
  echo "    fetch() found in no-network examples (DD-55):$FETCH_VIOLATIONS"
  FAILED=$((FAILED + 1))
else
  echo "PASS"
fi

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
