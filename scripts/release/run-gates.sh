#!/usr/bin/env bash
set -euo pipefail

# Consolidated Release Gate Runner
#
# Runs all quality gates for a PEAC release and produces a JSON report.
#
# Usage:
#   bash scripts/release/run-gates.sh --target preview
#   bash scripts/release/run-gates.sh --target stable
#   bash scripts/release/run-gates.sh --target stable --write-release-artifacts
#
# Flags:
#   --target preview|stable    Gate profile (required)
#   --write-release-artifacts  Write JSON report to docs/releases/<version>-gate-report.json
#                              This is the AUTHORITATIVE gate path for release decisions.
#                              Without this flag: dry-run only, no artifacts, no release claim.
#
# Exit codes:
#   0  All gates passed (and artifact written if --write-release-artifacts)
#   1  One or more gates failed, or artifact write failed
#
# Design:
#   The authoritative release evidence path is --write-release-artifacts.
#   Without it, the script is a local dry-run; it never claims "ready to tag."
#   With it, the JSON artifact IS the release evidence; the script exits 0
#   only when every gate passed AND the artifact was written successfully.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$REPO_ROOT"

# --- Portable millisecond timer ---
# macOS date(1) does not support %3N; use node for portable ms timestamps.
now_ms() {
  node -e "process.stdout.write(String(Date.now()))"
}

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
if $WRITE_ARTIFACTS; then
  echo "  Mode: AUTHORITATIVE (--write-release-artifacts)"
else
  echo "  Mode: dry-run (no artifacts written, no release claim)"
fi
echo ""

# --- Gate accumulator (uses a temp file, not piped stdin) ---
GATES_FILE=$(mktemp)
echo "[]" > "$GATES_FILE"
FAILED=0
TOTAL=0

append_gate() {
  local name="$1"
  local status="$2"
  local duration="$3"
  node -e "
    const fs = require('fs');
    const g = JSON.parse(fs.readFileSync('$GATES_FILE', 'utf8'));
    g.push({ name: '$name', status: '$status', duration_ms: $duration });
    fs.writeFileSync('$GATES_FILE', JSON.stringify(g));
  "
}

run_gate() {
  local name="$1"
  shift
  local start_ms
  start_ms=$(now_ms)
  TOTAL=$((TOTAL + 1))

  local gate_output
  gate_output=$(mktemp)

  echo -n "  [$name] "
  local exit_code=0
  "$@" > "$gate_output" 2>&1 || exit_code=$?

  local end_ms
  end_ms=$(now_ms)
  local duration=$((end_ms - start_ms))

  if [ "$exit_code" -eq 0 ]; then
    echo "PASS (${duration}ms)"
    rm -f "$gate_output"
    append_gate "$name" "passed" "$duration"
  else
    echo "FAIL (${duration}ms)"
    if [ -s "$gate_output" ]; then
      echo "    --- output (last 30 lines) ---"
      tail -30 "$gate_output" | sed 's/^/    /'
      echo "    --- end output ---"
    fi
    rm -f "$gate_output"
    FAILED=$((FAILED + 1))
    append_gate "$name" "failed" "$duration"
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
# Runs codegen, formats output, then verifies the tree is clean.
# If codegen produces different output than committed, the gate fails.
echo ""
echo "--- Codegen Freshness ---"
check_codegen_fresh() {
  pnpm exec tsx scripts/codegen-errors.ts > /dev/null 2>&1
  pnpm exec prettier --write \
    packages/kernel/src/errors.generated.ts \
    packages/kernel/src/error-categories.generated.ts > /dev/null 2>&1
  local stale=false
  for gf in packages/kernel/src/errors.generated.ts packages/kernel/src/error-categories.generated.ts; do
    if [ ! -f "$gf" ] || ! git diff --exit-code --quiet "$gf" 2>/dev/null; then
      stale=true
      break
    fi
  done
  if $stale; then
    echo "Generated files are stale. Re-run: pnpm exec tsx scripts/codegen-errors.ts"
    return 1
  fi
  return 0
}
run_gate "codegen-fresh" check_codegen_fresh

# --- No-Network Guard ---
echo ""
echo "--- No-Network Guard ---"
run_gate "no-network" node scripts/check-no-network.mjs

# --- Wire 0.1 Frozen ---
echo ""
echo "--- Wire 0.1 Frozen ---"
check_wire01_frozen() {
  if ! git rev-parse origin/main >/dev/null 2>&1; then
    echo "(auto-fetching origin/main)"
    git fetch origin main --depth=1 >/dev/null 2>&1 || {
      echo "origin/main not available and auto-fetch failed"
      return 1
    }
  fi
  local diff
  diff=$(git diff origin/main -- packages/schema/src/validators.ts packages/schema/src/attestation-receipt.ts)
  if [ -n "$diff" ]; then
    echo "Wire 0.1 files modified"
    return 1
  fi
  return 0
}
run_gate "wire-01-frozen" check_wire01_frozen

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

# --- CHANGELOG Coverage ---
echo ""
echo "--- CHANGELOG Coverage ---"
check_changelog_coverage() {
  local version
  version=$(node -p "require('./package.json').version")
  if grep -q "## \[$version\]" CHANGELOG.md; then
    return 0
  else
    echo "No CHANGELOG entry found for version $version"
    return 1
  fi
}
run_gate "changelog-coverage" check_changelog_coverage

# --- Stable-only gates (DD-90) ---
if [[ "$TARGET" == "stable" ]]; then
  echo ""
  echo "--- DD-90 Adoption Gates (stable only) ---"

  # Implemented gates
  run_gate "pack-install-smoke" bash scripts/release/pack-install-smoke.sh
  run_gate "api-surface-lock" bash scripts/release/api-surface-lock.sh

  # Implemented gates (PR 5: security hardening)
  run_gate "ssrf-suite" pnpm exec vitest run packages/net/node/tests/ssrf-expansion.test.ts tests/security/no-fetch-audit.test.ts --reporter=dot

  # These stubs hard-fail until real implementations land in later PRs.
  for stub_gate in "adoption-evidence" "perf-benchmarks" "fuzz-suite"; do
    TOTAL=$((TOTAL + 1))
    echo "  [$stub_gate] FAIL (not implemented: DD-90 requires implementation before stable release)"
    FAILED=$((FAILED + 1))
    append_gate "$stub_gate" "failed" 0
  done
fi

# --- Summary ---
echo ""
echo "=== Results ==="
PASSED=$((TOTAL - FAILED))
echo "Total: $TOTAL | Passed: $PASSED | Failed: $FAILED"

TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
COMMIT_SHA=$(git rev-parse HEAD 2>/dev/null || echo "unknown")
NODE_VERSION=$(node -v 2>/dev/null || echo "unknown")

# Machine-derived hashes for reproducibility verification
MANIFEST_HASH=$(sha256sum scripts/publish-manifest.json 2>/dev/null | cut -d' ' -f1 || shasum -a 256 scripts/publish-manifest.json 2>/dev/null | cut -d' ' -f1 || echo "unknown")
CONFORMANCE_HASH=$(find specs/conformance/fixtures -type f -name '*.json' 2>/dev/null | sort | xargs cat 2>/dev/null | shasum -a 256 | cut -d' ' -f1 || echo "unknown")

# CI metadata (populated in GitHub Actions, empty locally)
GITHUB_RUN_ID="${GITHUB_RUN_ID:-}"
GITHUB_RUN_ATTEMPT="${GITHUB_RUN_ATTEMPT:-}"
RUNNER_OS="${RUNNER_OS:-$(uname -s)}"
RUNNER_ARCH="${RUNNER_ARCH:-$(uname -m)}"

REPORT_JSON=$(node -e "
  const fs = require('fs');
  const os = require('os');
  const gates = JSON.parse(fs.readFileSync('$GATES_FILE', 'utf8'));
  const report = {
    report_schema_version: '1.0.0',
    target: '$TARGET',
    timestamp: '$TIMESTAMP',
    version: '$VERSION',
    commit: '$COMMIT_SHA',
    node_version: '$NODE_VERSION',
    runner: {
      os: '$RUNNER_OS',
      arch: '$RUNNER_ARCH',
      cpus: os.cpus().length,
      platform: os.platform(),
      ci_run_id: '$GITHUB_RUN_ID' || null,
      ci_run_attempt: '$GITHUB_RUN_ATTEMPT' || null
    },
    hashes: {
      publish_manifest: '$MANIFEST_HASH',
      conformance_fixtures: '$CONFORMANCE_HASH'
    },
    gates: gates,
    summary: { total: $TOTAL, passed: $PASSED, failed: $FAILED }
  };
  process.stdout.write(JSON.stringify(report, null, 2));
")

rm -f "$GATES_FILE"

if $WRITE_ARTIFACTS; then
  REPORT_PATH="docs/releases/${VERSION}-gate-report.json"

  # Artifact write must succeed; failure here is a hard error.
  echo "$REPORT_JSON" > "$REPORT_PATH"
  if [ ! -s "$REPORT_PATH" ]; then
    echo ""
    echo "FATAL: Failed to write gate report to $REPORT_PATH"
    exit 1
  fi
  echo ""
  echo "Gate report written to $REPORT_PATH"

  if [ "$FAILED" -eq 0 ]; then
    echo ""
    echo "All gates PASSED. Artifact written. Ready to tag v$VERSION."
    exit 0
  else
    echo ""
    echo "$FAILED gate(s) FAILED. Artifact written (records failure). Fix before tagging."
    exit 1
  fi
else
  # Dry-run mode: never claim "ready to tag"
  if [ "$FAILED" -eq 0 ]; then
    echo ""
    echo "All gates passed (dry-run). Re-run with --write-release-artifacts for authoritative evidence."
    exit 0
  else
    echo ""
    echo "$FAILED gate(s) FAILED."
    exit 1
  fi
fi
