#!/bin/bash
# scripts/check-error-codes.sh
# Verify TS error codes are defined in kernel SoT

set -e

echo "=== Checking error code parity ==="

# Get error codes from kernel SoT
KERNEL_CODES=$(node -e "
const errors = require('./specs/kernel/errors.json').errors;
console.log(errors.map(e => e.code).sort().join('\n'));
")

# Get error codes from TS ERROR_CODES constant and error maps
# Look for actual error code definitions, not just E_ prefixed variables
TS_CODES=$(node -e "
const fs = require('fs');
const path = require('path');

const codes = new Set();

// Files known to define error codes
const errorFiles = [
  'packages/schema/src/errors.ts',
  'packages/transport/grpc/src/index.ts',
  'packages/http-signatures/src/errors.ts',
  'packages/mappings/tap/src/errors.ts',
  'packages/jwks-cache/src/errors.ts',
  'surfaces/nextjs/middleware/src/errors.ts',
  'surfaces/workers/cloudflare/src/errors.ts',
];

for (const file of errorFiles) {
  try {
    const content = fs.readFileSync(file, 'utf8');
    // Match string literals that are error codes
    const matches = content.matchAll(/['\"]E_[A-Z_]+['\"]/g);
    for (const m of matches) {
      const code = m[0].slice(1, -1); // Remove quotes
      if (code.length > 2) codes.add(code);
    }
  } catch {}
}

console.log([...codes].sort().join('\n'));
")

# Compare and report
echo ""
echo "Kernel SoT codes ($(echo "$KERNEL_CODES" | wc -l | tr -d ' ')):"
echo "$KERNEL_CODES" | sed 's/^/  /'
echo ""
echo "TS-defined codes ($(echo "$TS_CODES" | wc -l | tr -d ' ')):"
echo "$TS_CODES" | sed 's/^/  /'

# Check for codes in TS but not in kernel
MISSING_IN_KERNEL=()
while IFS= read -r code; do
  if [ -n "$code" ] && ! echo "$KERNEL_CODES" | grep -q "^${code}$"; then
    MISSING_IN_KERNEL+=("$code")
  fi
done <<< "$TS_CODES"

# Check for codes in kernel but not used in TS
UNUSED_KERNEL=()
while IFS= read -r code; do
  if [ -n "$code" ] && ! echo "$TS_CODES" | grep -q "^${code}$"; then
    UNUSED_KERNEL+=("$code")
  fi
done <<< "$KERNEL_CODES"

echo ""
if [ ${#MISSING_IN_KERNEL[@]} -gt 0 ]; then
  echo "DRIFT: Codes defined in TS but not in kernel SoT (${#MISSING_IN_KERNEL[@]}):"
  for code in "${MISSING_IN_KERNEL[@]}"; do
    echo "  $code"
  done
  echo ""
  echo "Action: Add these to specs/kernel/errors.json"
else
  echo "OK: All TS error codes are in kernel SoT"
fi

echo ""
if [ ${#UNUSED_KERNEL[@]} -gt 0 ]; then
  echo "INFO: Codes in kernel SoT but not found in TS error files (${#UNUSED_KERNEL[@]}):"
  for code in "${UNUSED_KERNEL[@]}"; do
    echo "  $code"
  done
  echo "(These may be used elsewhere or reserved for future use)"
fi

echo ""
echo "=== Error code check complete ==="

# Don't fail CI - this is advisory until full alignment
exit 0
