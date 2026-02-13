#!/usr/bin/env bash
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

# Deterministic package directories (in dependency order)
PKG_NAMES=("@peac/kernel" "@peac/privacy" "@peac/telemetry" "@peac/telemetry-otel")
PKG_DIRS=(
  "$ROOT_DIR/packages/kernel"
  "$ROOT_DIR/packages/privacy"
  "$ROOT_DIR/packages/telemetry"
  "$ROOT_DIR/packages/telemetry-otel"
)

# Read peer range from package.json (matches what consumers will install)
OTEL_API_RANGE=$(node -e "
  const pkg = JSON.parse(require('fs').readFileSync('$ROOT_DIR/packages/telemetry-otel/package.json', 'utf-8'));
  console.log(pkg.peerDependencies['@opentelemetry/api']);
")
if [ -z "$OTEL_API_RANGE" ]; then
  echo "FAIL: Could not read @opentelemetry/api peer range from package.json"
  exit 1
fi
echo "OTel API peer range: $OTEL_API_RANGE"

# 0. Build required packages
echo ""
echo "0. Building packages..."
cd "$ROOT_DIR"
FILTER_ARGS=()
for pkg in "${PKG_NAMES[@]}"; do
  FILTER_ARGS+=("--filter" "$pkg")
done
pnpm "${FILTER_ARGS[@]}" build

# 1. Pack all packages
echo ""
echo "1. Packing packages..."
declare -a TARBALLS=()
for i in "${!PKG_NAMES[@]}"; do
  pkg="${PKG_NAMES[$i]}"
  pkg_dir="${PKG_DIRS[$i]}"
  if [ ! -d "$pkg_dir" ]; then
    echo "FAIL: Package directory not found: $pkg_dir"
    exit 1
  fi
  cd "$pkg_dir"
  # Count tarballs before packing so we can find the new one
  before_count=$(ls -1 "$TEMP_DIR"/*.tgz 2>/dev/null | wc -l)
  pnpm pack --pack-destination "$TEMP_DIR"
  # Find the newest .tgz (the one we just packed)
  tarball=$(ls -1t "$TEMP_DIR"/*.tgz 2>/dev/null | head -1)
  after_count=$(ls -1 "$TEMP_DIR"/*.tgz 2>/dev/null | wc -l)
  if [ -z "$tarball" ] || [ "$after_count" -le "$before_count" ]; then
    echo "FAIL: Tarball not found for $pkg"
    echo "Contents of $TEMP_DIR:"
    ls -la "$TEMP_DIR"
    exit 1
  fi
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
unset NPM_TOKEN npm_config_token NPM_CONFIG_TOKEN 2>/dev/null || true
unset npm_config__auth NPM_CONFIG__AUTH 2>/dev/null || true
export NPM_CONFIG_USERCONFIG="$USER_NPMRC"
export NPM_CONFIG_GLOBALCONFIG="$GLOBAL_NPMRC"
export NPM_CONFIG_CACHE="$TEMP_DIR/npm-cache"
export NPM_CONFIG_REGISTRY="https://registry.npmjs.org/"
export NPM_CONFIG_AUDIT=false
export NPM_CONFIG_FUND=false

# 3. Install tarballs + peer dep (use exact peer range, not @latest)
#    --ignore-scripts: no post-install side effects
#    --no-package-lock: no lockfile needed for a throwaway test project
echo ""
echo "3. Installing tarballs + @opentelemetry/api@$OTEL_API_RANGE..."
npm install --ignore-scripts --no-package-lock "${TARBALLS[@]}" "@opentelemetry/api@$OTEL_API_RANGE"

# 4. Verify no unresolved workspace deps
echo ""
echo "4. Checking for unresolved workspace deps..."
if grep -r "workspace:" node_modules/@peac/*/package.json 2>/dev/null; then
  echo "FAIL: Found unresolved workspace:* dependencies"
  exit 1
fi
echo "   OK: No unresolved workspace dependencies"

# 5. Verify resolved dependency tree has expected packages
echo ""
echo "5. Verifying installed packages..."
for pkg in "${PKG_NAMES[@]}"; do
  pkg_path="node_modules/${pkg}"
  if [ ! -d "$pkg_path" ]; then
    echo "FAIL: $pkg not found in node_modules"
    exit 1
  fi
done
if [ ! -d "node_modules/@opentelemetry/api" ]; then
  echo "FAIL: @opentelemetry/api not found in node_modules"
  exit 1
fi
echo "   OK: All expected packages installed"

# 6. Run import smoke test
echo ""
echo "6. Running import smoke test..."
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
