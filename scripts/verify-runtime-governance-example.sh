#!/usr/bin/env bash
# verify-runtime-governance-example.sh
#
# Merge-blocking gate: proves the runtime-governance records example works
# end-to-end. Runs the demo, asserts exact output expectations.
#
# Exit 0: example verified
# Exit 1: example failed

set -euo pipefail

EXAMPLE_DIR="examples/runtime-governance-records"

echo "[gate] Running runtime-governance records example..."

# Run the demo and capture output
OUTPUT=$(pnpm --filter @peac/example-runtime-governance-records demo 2>&1)
EXIT_CODE=$?

if [ "$EXIT_CODE" -ne 0 ]; then
  echo "[gate] FAIL: demo exited with code $EXIT_CODE"
  echo "$OUTPUT"
  exit 1
fi

echo "$OUTPUT"

# Assert exactly 6 records issued
if ! echo "$OUTPUT" | grep -q "6 receipts issued"; then
  echo "[gate] FAIL: expected '6 receipts issued' in output"
  exit 1
fi

# Assert all 6 verified
if ! echo "$OUTPUT" | grep -q "6 verified"; then
  echo "[gate] FAIL: expected '6 verified' in output"
  exit 1
fi

# Assert all 6 families present
for FAMILY in policy_decision audit_entry authority_scope lifecycle_event trust_observation compliance_observation; do
  if ! echo "$OUTPUT" | grep -q "$FAMILY"; then
    echo "[gate] FAIL: expected family '$FAMILY' in output"
    exit 1
  fi
done

# Assert session summary present
if ! echo "$OUTPUT" | grep -q "Session Summary"; then
  echo "[gate] FAIL: expected 'Session Summary' in output"
  exit 1
fi

# Assert issuer is present (proves caller-supplied identity is in the record)
if ! echo "$OUTPUT" | grep -q "governance-demo.example.com"; then
  echo "[gate] FAIL: expected issuer 'governance-demo.example.com' in output"
  exit 1
fi

# Assert unknown count is 0
if ! echo "$OUTPUT" | grep -q "Unknown:  0"; then
  echo "[gate] FAIL: expected 'Unknown:  0' in output"
  exit 1
fi

# Assert demo completed successfully
if ! echo "$OUTPUT" | grep -q "Demo OK"; then
  echo "[gate] FAIL: expected 'Demo OK' in output"
  exit 1
fi

# Assert no network access (no fetch/http in demo source)
if grep -qE 'fetch\(|http\.request|https\.request|net\.connect' "$EXAMPLE_DIR/demo.ts"; then
  echo "[gate] FAIL: demo.ts contains network access patterns"
  exit 1
fi

# Assert no vendor SDK dependency in example package
if grep -qE '"@microsoft|"@azure|"agentmesh|"agent-os' "$EXAMPLE_DIR/package.json"; then
  echo "[gate] FAIL: example package.json contains vendor dependencies"
  exit 1
fi

# Assert no placeholder digests in demo
if grep -qE 'sha256:abc|sha256:def|a1b2c3|f6e5d4' "$EXAMPLE_DIR/demo.ts"; then
  echo "[gate] FAIL: demo.ts contains placeholder digests"
  exit 1
fi

echo "[gate] OK: runtime-governance records example verified"
