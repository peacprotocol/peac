#!/usr/bin/env bash
set -euo pipefail

# Validate that all edge worker surfaces typecheck cleanly.
# These are private packages (not published) but must remain buildable.

echo "Checking worker surface typechecks..."

failed=0

for pkg in "@peac/worker-cloudflare" "@peac/worker-akamai" "@peac/worker-fastly"; do
  echo "  Checking $pkg..."
  if pnpm --filter "$pkg" run typecheck 2>&1; then
    echo "  OK: $pkg"
  else
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
