#!/bin/bash
# OTel pack-and-import smoke test
#
# Verifies that @peac/telemetry-otel can be installed from a tarball
# with only @opentelemetry/api as a peer dependency, and that the
# public API (createOtelProvider) resolves correctly.
#
# This catches missing dist files, broken exports maps, and unresolved
# workspace dependencies before they reach npm consumers.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
TEMP_DIR=$(mktemp -d)

cleanup() {
  rm -rf "$TEMP_DIR"
}
trap cleanup EXIT

echo "=== OTel Pack-and-Import Smoke Test ==="
echo "Root: $ROOT_DIR"
echo "Temp: $TEMP_DIR"

# Packages needed (in dependency order)
OTEL_DEPS=("@peac/kernel" "@peac/privacy" "@peac/telemetry" "@peac/telemetry-otel")

# 0. Build required packages
echo ""
echo "0. Building packages..."
cd "$ROOT_DIR"
FILTER_ARGS=""
for pkg in "${OTEL_DEPS[@]}"; do
  FILTER_ARGS+=" --filter $pkg"
done
pnpm $FILTER_ARGS build

# 1. Pack all packages
echo ""
echo "1. Packing packages..."
declare -a TARBALLS=()
for pkg in "${OTEL_DEPS[@]}"; do
  pkg_dir=$(cd "$ROOT_DIR" && pnpm --filter "$pkg" exec pwd 2>/dev/null | tail -1)
  cd "$pkg_dir"
  tarball=$(pnpm pack --pack-destination "$TEMP_DIR" 2>/dev/null | tail -1)
  echo "   $pkg -> $(basename "$tarball")"
  TARBALLS+=("$tarball")
done

# 2. Create test project
echo ""
echo "2. Creating test project..."
TEST_DIR="$TEMP_DIR/test-project"
mkdir -p "$TEST_DIR"
cd "$TEST_DIR"
cat > package.json << 'EOF'
{
  "name": "otel-smoke-test",
  "type": "module",
  "private": true
}
EOF

# Deterministic npm config isolation
USER_NPMRC="$TEMP_DIR/user.npmrc"
GLOBAL_NPMRC="$TEMP_DIR/global.npmrc"
echo "registry=https://registry.npmjs.org/" > "$USER_NPMRC"
: > "$GLOBAL_NPMRC"
unset NPM_TOKEN npm_config_token NPM_CONFIG_TOKEN
unset npm_config__auth NPM_CONFIG__AUTH
export NPM_CONFIG_USERCONFIG="$USER_NPMRC"
export NPM_CONFIG_GLOBALCONFIG="$GLOBAL_NPMRC"
export NPM_CONFIG_CACHE="$TEMP_DIR/npm-cache"
export NPM_CONFIG_REGISTRY="https://registry.npmjs.org/"
export NPM_CONFIG_AUDIT=false
export NPM_CONFIG_FUND=false

# 3. Install tarballs + peer dep
echo ""
echo "3. Installing tarballs + @opentelemetry/api..."
npm install "${TARBALLS[@]}" @opentelemetry/api@latest

# 4. Verify no unresolved workspace deps
echo ""
echo "4. Checking for unresolved workspace deps..."
if grep -r "workspace:" node_modules/@peac/*/package.json 2>/dev/null; then
  echo "FAIL: Found unresolved workspace:* dependencies"
  exit 1
fi
echo "   OK: No unresolved workspace dependencies"

# 5. Run import smoke test
echo ""
echo "5. Running import smoke test..."
cat > test.mjs << 'SMOKE_EOF'
// Verify that @peac/telemetry-otel resolves and exports createOtelProvider
const mod = await import('@peac/telemetry-otel');

if (typeof mod.createOtelProvider !== 'function') {
  console.error('FAIL: createOtelProvider is not a function');
  console.error('Exports:', Object.keys(mod));
  process.exit(1);
}

// Verify it can be called with no-op API (no SDK installed)
const provider = mod.createOtelProvider({ serviceName: 'smoke-test' });

if (!provider || typeof provider !== 'object') {
  console.error('FAIL: createOtelProvider did not return an object');
  process.exit(1);
}

console.log('   Exports:', Object.keys(mod).join(', '));
console.log('   createOtelProvider: callable, returns object');
console.log('   OK: @peac/telemetry-otel works with only @opentelemetry/api');
SMOKE_EOF

node test.mjs

echo ""
echo "=== OTel Pack-and-Import Smoke Test PASSED ==="
