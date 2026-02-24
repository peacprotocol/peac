#!/usr/bin/env bash
set -euo pipefail

# Validate that all edge worker surfaces typecheck cleanly.
# These are private packages (not published) but must remain buildable.

echo "Checking worker surface typechecks..."

failed=0

for pkg in "@peac/worker-cloudflare" "@peac/worker-akamai" "@peac/worker-fastly"; do
  echo "  Checking $pkg..."
  output=$(pnpm --filter "$pkg" run typecheck 2>&1)
  exit_code=$?

  # Fail explicitly if pnpm could not match the package (silent no-op is wrong)
  if echo "$output" | grep -q "No projects matched"; then
    echo "  FAIL: pnpm filter '$pkg' matched no projects -- package may have been renamed"
    failed=1
    continue
  fi

  if [ "$exit_code" -eq 0 ]; then
    echo "  OK: $pkg"
  else
    echo "$output"
    echo "  FAIL: $pkg typecheck failed"
    failed=1
  fi
done

if [ "$failed" -eq 1 ]; then
  echo ""
  echo "FAIL: Surface validation failed."
  exit 1
fi

echo "OK: All worker surfaces typecheck clean."

# ---------------------------------------------------------------------------
# Distribution surface validation (DD-140)
# ---------------------------------------------------------------------------
echo ""
echo "Checking distribution surfaces..."
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
bash "$SCRIPT_DIR/../check-distribution.sh"
