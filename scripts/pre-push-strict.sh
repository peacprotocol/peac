#!/usr/bin/env bash
# scripts/pre-push-strict.sh
#
# Local-CI parity gate for the checks that run in CI but are not part of the
# default pre-push Tier 1. Runs:
#
#   1. scripts/ci/forbid-strings.sh: repo-wide forbidden-string scan
#                                    (em dashes in source, deprecated header
#                                    names, etc.). Failure here previously
#                                    surfaced only after a CI round-trip.
#   2. cd sdks/go && gofmt -l .:     Go formatting check; mirrors the
#                                    golangci-lint gofmt rule that the Go
#                                    SDK CI workflow enforces.
#   3. cd sdks/go && go vet ./...:   Go vet analysis; catches the same
#                                    unusedresult / printf class issues that
#                                    the Go SDK CI workflow surfaces.
#
# Usage:
#   bash scripts/pre-push-strict.sh
#
# Skipping Go checks:
#   - If sdks/go/ is absent, Go checks are skipped silently.
#   - If `go` is not on PATH, Go checks are skipped with a notice. Documentation
#     and tooling-only contributors do not need a Go toolchain installed.
#
# Exit codes:
#   0  all enabled checks passed
#   1  at least one check failed (failing check name is printed)

set -euo pipefail

repo_root="$(git rev-parse --show-toplevel)"
cd "$repo_root"

bad=0

run_check() {
  local label="$1"; shift
  local tmpout
  tmpout=$(mktemp)
  printf "[pre-push-strict] %-40s" "$label"
  if "$@" > "$tmpout" 2>&1; then
    echo "OK"
  else
    echo "FAIL"
    echo ""
    tail -40 "$tmpout" | sed 's/^/    /'
    echo ""
    echo "    Rerun: $*"
    echo ""
    bad=1
  fi
  rm -f "$tmpout"
}

# ----------------------------------------------------------------------------
# 1. Forbidden-string scan
# ----------------------------------------------------------------------------
if [ -f scripts/ci/forbid-strings.sh ]; then
  run_check "forbid-strings" bash scripts/ci/forbid-strings.sh
else
  echo "[pre-push-strict] forbid-strings.sh missing; skipping"
fi

# ----------------------------------------------------------------------------
# 2 + 3. Go gofmt + go vet (skipped cleanly if no Go toolchain or no sdks/go)
# ----------------------------------------------------------------------------
if [ -d sdks/go ]; then
  if command -v go > /dev/null 2>&1 && command -v gofmt > /dev/null 2>&1; then
    # gofmt -l prints the names of files that need reformatting; non-empty
    # output means failure even though the exit status is 0.
    gofmt_check() {
      local out
      out=$(cd sdks/go && gofmt -l .)
      if [ -n "$out" ]; then
        echo "Files need gofmt:"
        echo "$out"
        return 1
      fi
      return 0
    }
    run_check "go gofmt -l ./sdks/go" gofmt_check
    run_check "go vet ./sdks/go/..." bash -c 'cd sdks/go && go vet ./...'
  else
    echo "[pre-push-strict] go toolchain not on PATH; skipping gofmt + go vet"
  fi
else
  echo "[pre-push-strict] sdks/go absent; skipping gofmt + go vet"
fi

if [ "$bad" -ne 0 ]; then
  echo ""
  echo "[pre-push-strict] FAIL"
  exit 1
fi

echo ""
echo "[pre-push-strict] OK"
