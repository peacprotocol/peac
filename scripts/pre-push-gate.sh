#!/usr/bin/env bash
# Pre-push gate: runs the same checks CI does, locally, before pushing.
# Catches failures that would otherwise waste 6+ minutes per CI round-trip.
#
# Usage:
#   bash scripts/pre-push-gate.sh          # full gate (all checks)
#   bash scripts/pre-push-gate.sh --fast   # skip slow checks (audit, lockfile, pack)
#   PEAC_SKIP_GATE=1 git push ...          # bypass entirely (escape hatch)
#
# Install as git hook:
#   bash scripts/pre-push-gate.sh --install-hook
#
set -euo pipefail

# ── escape hatch ──────────────────────────────────────────────────────────────
if [ "${PEAC_SKIP_GATE:-0}" = "1" ]; then
  echo "[pre-push-gate] PEAC_SKIP_GATE=1: skipping all checks"
  exit 0
fi

# ── hook installer ────────────────────────────────────────────────────────────
if [ "${1:-}" = "--install-hook" ]; then
  hook_path="$(git rev-parse --git-dir)/hooks/pre-push"
  cat > "$hook_path" <<'HOOK'
#!/usr/bin/env bash
# Auto-installed by scripts/pre-push-gate.sh --install-hook
# Bypass: PEAC_SKIP_GATE=1 git push ...
exec bash scripts/pre-push-gate.sh
HOOK
  chmod +x "$hook_path"
  echo "[pre-push-gate] Installed git pre-push hook at $hook_path"
  echo "[pre-push-gate] Bypass with: PEAC_SKIP_GATE=1 git push ..."
  exit 0
fi

# ── mode ──────────────────────────────────────────────────────────────────────
FAST=0
if [ "${1:-}" = "--fast" ]; then
  FAST=1
fi

# ── tracking ──────────────────────────────────────────────────────────────────
passed=0
failed=0
skipped=0
failures=""
start_time=$(date +%s)

run_check() {
  local name="$1"
  shift
  echo ""
  echo "== [$name] =="
  if "$@"; then
    passed=$((passed + 1))
    echo "   PASS"
  else
    failed=$((failed + 1))
    failures="$failures\n  - $name"
    echo "   FAIL"
  fi
}

skip_check() {
  local name="$1"
  skipped=$((skipped + 1))
  echo ""
  echo "== [$name] == SKIPPED (--fast)"
}

echo "============================================================"
echo " PEAC Pre-Push Gate"
echo " Mode: $([ "$FAST" = 1 ] && echo 'FAST (subset)' || echo 'FULL (all CI checks)')"
echo "============================================================"

# ── 1. Format check (catches Prettier issues) ────────────────────────────────
run_check "Prettier format" pnpm format:check

# ── 2. Lint (catches unused imports, code quality) ────────────────────────────
run_check "ESLint" pnpm lint

# ── 3. Forbidden strings (blocked patterns, emojis, deprecated names) ────────
run_check "Forbidden strings" bash scripts/ci/forbid-strings.sh

# ── 4. Guard script (45 checks: domain, headers, dist imports, etc.) ─────────
if [ "$FAST" = 0 ]; then
  run_check "Guard (full)" bash scripts/guard.sh
else
  # Run guard with PEAC_FAST to skip audit + lockfile drift
  run_check "Guard (fast)" env PEAC_FAST=1 bash scripts/guard.sh
fi

# ── 5. Planning leak check ───────────────────────────────────────────────────
run_check "Planning leak" bash scripts/check-planning-leak.sh

# ── 6. TypeScript type checking ──────────────────────────────────────────────
run_check "TypeScript (core)" pnpm typecheck:core

# ── 7. Build ─────────────────────────────────────────────────────────────────
run_check "Build" pnpm build

# ── 8. Schema meta-validation (registries.schema.json, etc.) ─────────────────
run_check "Schema validation" node scripts/lint-schemas.mjs

# ── 9. Fixture integrity (manifest entries, schema_version, versions) ────────
run_check "Fixture integrity" node scripts/validate-fixtures.mjs

# ── 10. Conformance tests (manifest hygiene, version consistency, etc.) ──────
run_check "Conformance tests" pnpm test:conformance

# ── 11. Core tests ──────────────────────────────────────────────────────────
run_check "Tests" pnpm test

# ── 12. Error codegen drift ─────────────────────────────────────────────────
if [ "$FAST" = 0 ]; then
  run_check "Codegen drift" bash -c 'pnpm codegen:errors && pnpm exec prettier --write "packages/kernel/src/errors.generated.ts" && git diff --exit-code -- packages/kernel/src/errors.generated.ts'
else
  skip_check "Codegen drift"
fi

# ── 13. Publish list check ──────────────────────────────────────────────────
if [ "$FAST" = 0 ]; then
  run_check "Publish list" bash scripts/check-publish-list.sh
else
  skip_check "Publish list"
fi

# ── summary ──────────────────────────────────────────────────────────────────
end_time=$(date +%s)
elapsed=$((end_time - start_time))
total=$((passed + failed + skipped))

echo ""
echo "============================================================"
echo " Pre-Push Gate Results"
echo "============================================================"
echo "  Passed:  $passed / $total"
echo "  Failed:  $failed / $total"
echo "  Skipped: $skipped / $total"
echo "  Time:    ${elapsed}s"

if [ "$failed" -gt 0 ]; then
  echo ""
  echo "  FAILED CHECKS:$failures"
  echo ""
  echo "  Fix these before pushing. Bypass: PEAC_SKIP_GATE=1 git push ..."
  echo "============================================================"
  exit 1
else
  echo ""
  echo "  All checks passed. Safe to push."
  echo "============================================================"
  exit 0
fi
