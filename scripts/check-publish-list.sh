#!/bin/bash
# scripts/check-publish-list.sh
# Verify publish list matches actual public packages

set -e

echo "=== Checking publish list drift ==="

# Get all public packages from package.json files
ACTUAL_PACKAGES=$(node -e "
const fs = require('fs');
const pkgPaths = [
  ...fs.readdirSync('packages').filter(d => !d.startsWith('.')).map(d => 'packages/' + d + '/package.json'),
  ...fs.readdirSync('packages/rails').filter(d => !d.startsWith('.')).map(d => 'packages/rails/' + d + '/package.json'),
  ...fs.readdirSync('packages/mappings').filter(d => !d.startsWith('.')).map(d => 'packages/mappings/' + d + '/package.json'),
  ...fs.readdirSync('packages/transport').filter(d => !d.startsWith('.')).map(d => 'packages/transport/' + d + '/package.json'),
];
const pub = [];
for (const p of pkgPaths) {
  try {
    const pkg = JSON.parse(fs.readFileSync(p, 'utf8'));
    if (pkg.private !== true && pkg.name) pub.push(pkg.name);
  } catch {}
}
console.log(pub.sort().join('\n'));
")

# Expected packages (from v0.9.18_publish_inventory.md)
EXPECTED_PACKAGES=$(cat <<'EOF'
@peac/cli
@peac/control
@peac/core
@peac/crypto
@peac/disc
@peac/http-signatures
@peac/jwks-cache
@peac/kernel
@peac/mappings-acp
@peac/mappings-mcp
@peac/mappings-rsl
@peac/mappings-tap
@peac/pay402
@peac/policy-kit
@peac/pref
@peac/protocol
@peac/rails-stripe
@peac/rails-x402
@peac/receipts
@peac/schema
@peac/sdk
@peac/server
EOF
)

# Compare
DIFF=$(diff <(echo "$EXPECTED_PACKAGES") <(echo "$ACTUAL_PACKAGES") || true)

if [ -n "$DIFF" ]; then
  echo "FAIL: Publish list drift detected!"
  echo ""
  echo "Difference (expected vs actual):"
  echo "$DIFF"
  echo ""
  echo "Update the EXPECTED_PACKAGES list in this script or fix package.json files."
  exit 1
else
  echo "OK: All 22 public packages match"
  echo "$ACTUAL_PACKAGES" | wc -l | xargs -I{} echo "Total: {} packages"
fi
