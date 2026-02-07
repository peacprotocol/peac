#!/bin/bash
# Pack and install smoke test (manifest-driven)
#
# Reads packages from scripts/publish-manifest.json.
# Tests that all manifest packages can be installed from tarballs
# and that @peac/protocol can be imported from a clean project.
# Uses npm (not pnpm) to match real consumer install experience.
#
# NOTE: This test works pre-publish because npm can satisfy transitive deps
# when all tarballs are installed together.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
TEMP_DIR=$(mktemp -d)
MANIFEST="$ROOT_DIR/scripts/publish-manifest.json"

cleanup() {
  rm -rf "$TEMP_DIR"
}
trap cleanup EXIT

echo "=== Pack Install Smoke Test ==="
echo "Root: $ROOT_DIR"
echo "Temp: $TEMP_DIR"

# Read package list from manifest
PACKAGES=()
while IFS= read -r line; do
  PACKAGES+=("$line")
done < <(node -e "
  const m = JSON.parse(require('fs').readFileSync('$MANIFEST', 'utf-8'));
  m.packages.forEach(p => console.log(p));
")
echo "Manifest: ${#PACKAGES[@]} packages"

# Build manifest packages
echo ""
echo "0. Building manifest packages..."
cd "$ROOT_DIR"
FILTER_ARGS=""
for pkg in "${PACKAGES[@]}"; do
  FILTER_ARGS+=" --filter $pkg"
done
pnpm $FILTER_ARGS build

# Pack all packages in manifest order
echo ""
echo "1. Packing packages..."
declare -a TARBALLS=()
for pkg in "${PACKAGES[@]}"; do
  pkg_dir=$(cd "$ROOT_DIR" && pnpm --filter "$pkg" exec pwd 2>/dev/null | tail -1)
  cd "$pkg_dir"
  tarball=$(pnpm pack --pack-destination "$TEMP_DIR" 2>/dev/null | tail -1)
  echo "   $pkg -> $(basename "$tarball")"
  TARBALLS+=("$tarball")
done

# Create test project
echo ""
echo "2. Creating test project..."
TEST_DIR="$TEMP_DIR/test-project"
mkdir -p "$TEST_DIR"
cd "$TEST_DIR"
cat > package.json << 'EOF'
{
  "name": "pack-smoke-test",
  "type": "module",
  "private": true
}
EOF

# Deterministic npm config isolation
# Use two SEPARATE empty config files (npm errors if userconfig == globalconfig)
# This ensures no stale ~/.npmrc or CI runner config causes auth notices
USER_NPMRC="$TEMP_DIR/user.npmrc"
GLOBAL_NPMRC="$TEMP_DIR/global.npmrc"
echo "registry=https://registry.npmjs.org/" > "$USER_NPMRC"
: > "$GLOBAL_NPMRC"

# Clear all npm auth-related environment variables
unset NPM_TOKEN npm_config_token NPM_CONFIG_TOKEN
unset npm_config__auth NPM_CONFIG__AUTH

# Force npm to use only our isolated configs
export NPM_CONFIG_USERCONFIG="$USER_NPMRC"
export NPM_CONFIG_GLOBALCONFIG="$GLOBAL_NPMRC"
export NPM_CONFIG_CACHE="$TEMP_DIR/npm-cache"
export NPM_CONFIG_REGISTRY="https://registry.npmjs.org/"

# Disable audit/fund to keep smoke output focused
export NPM_CONFIG_AUDIT=false
export NPM_CONFIG_FUND=false

# Install all tarballs using npm (matches consumer reality)
# npm can satisfy transitive @peac/* deps from sibling tarballs
echo ""
echo "3. Installing tarballs with npm..."
npm install "${TARBALLS[@]}"

# Check for unresolved workspace dependencies
echo ""
echo "4. Checking installed packages..."
if grep -r "workspace:" node_modules/@peac/*/package.json 2>/dev/null; then
  echo "FAIL: Found unresolved workspace:* dependencies"
  exit 1
fi
echo "   OK: No unresolved workspace dependencies"

# Create and run smoke test
echo ""
echo "5. Running import smoke test..."
cat > test.mjs << 'EOF'
import { issue, verifyLocal, generateKeypair } from '@peac/protocol';

const EXPECTED_KID = 'test-key-2026';

// Basic smoke test
const { privateKey, publicKey } = await generateKeypair();

const { jws } = await issue({
  iss: 'https://api.example.com',
  aud: 'https://client.example.com',
  amt: 1000,
  cur: 'USD',
  rail: 'x402',
  reference: 'tx_test',
  asset: 'USD',
  env: 'test',
  evidence: {},
  privateKey,
  kid: EXPECTED_KID,
});

const result = await verifyLocal(jws, publicKey);

if (!result.valid) {
  console.error('FAIL: Verification failed:', result.code, result.message);
  process.exit(1);
}

// Assert kid is present and matches (contract enforcement)
if (result.kid !== EXPECTED_KID) {
  console.error(`FAIL: kid mismatch: expected "${EXPECTED_KID}", got "${result.kid}"`);
  process.exit(1);
}

console.log('   Issuer:', result.claims.iss);
console.log('   Amount:', result.claims.amt, result.claims.cur);
console.log('   Key ID:', result.kid);
console.log('   OK: Issue and verifyLocal work correctly');
EOF

node test.mjs

echo ""
echo "=== Pack Install Smoke Test PASSED ==="
