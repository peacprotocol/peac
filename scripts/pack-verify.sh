#!/bin/bash
# Pack verification gate
# Verifies that pnpm pack correctly resolves workspace:* dependencies.
# This catches issues where tarballs would be published with unresolved workspace:* refs.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
TEMP_DIR=$(mktemp -d)

cleanup() {
  rm -rf "$TEMP_DIR"
}
trap cleanup EXIT

echo "=== Pack Verification Gate ==="
echo "Root: $ROOT_DIR"
echo "Temp: $TEMP_DIR"

# Build only the packages we're going to pack (not the whole monorepo)
echo ""
echo "0. Building packages..."
cd "$ROOT_DIR"
pnpm --filter @peac/kernel --filter @peac/schema --filter @peac/crypto --filter @peac/telemetry --filter @peac/protocol build

# Pack all packages in dependency order
# Layer 0: kernel (no deps)
# Layer 1: schema (kernel), telemetry (kernel)
# Layer 2: crypto (kernel, schema)
# Layer 3: protocol (kernel, schema, crypto, telemetry)
PACKAGES=(
  "kernel"
  "schema"
  "crypto"
  "telemetry"
  "protocol"
)

echo ""
echo "1. Packing packages..."
declare -a TARBALLS=()
for pkg in "${PACKAGES[@]}"; do
  cd "$ROOT_DIR/packages/$pkg"
  tarball=$(pnpm pack --pack-destination "$TEMP_DIR" 2>/dev/null | tail -1)
  echo "   @peac/$pkg -> $(basename "$tarball")"
  TARBALLS+=("$tarball")
done

# Extract and verify each tarball
echo ""
echo "2. Verifying tarball contents..."
FAILED=0

for tarball in "${TARBALLS[@]}"; do
  pkg_name=$(basename "$tarball" .tgz)
  extract_dir="$TEMP_DIR/extract-$pkg_name"
  mkdir -p "$extract_dir"

  # Extract tarball
  tar -xzf "$tarball" -C "$extract_dir"

  # Check for unresolved workspace:* dependencies
  pkg_json="$extract_dir/package/package.json"
  if grep -q '"workspace:' "$pkg_json" 2>/dev/null; then
    echo "   FAIL: $pkg_name has unresolved workspace:* dependencies:"
    grep '"workspace:' "$pkg_json" | head -5
    FAILED=1
  else
    echo "   OK: $pkg_name - no workspace:* refs"
  fi

  # Show @peac/* dependencies (should have version numbers)
  peac_deps=$(grep -o '"@peac/[^"]*": "[^"]*"' "$pkg_json" 2>/dev/null || true)
  if [ -n "$peac_deps" ]; then
    echo "      deps: $(echo "$peac_deps" | tr '\n' ' ')"
  fi
done

if [ "$FAILED" -eq 1 ]; then
  echo ""
  echo "FAIL: Tarball verification failed"
  exit 1
fi

# Verify @peac/protocol has expected exports
echo ""
echo "3. Verifying @peac/protocol exports..."
# Find the protocol tarball by pattern (avoids hardcoded version)
protocol_tarball=$(ls "$TEMP_DIR"/peac-protocol-*.tgz 2>/dev/null | head -1)
protocol_name=$(basename "$protocol_tarball" .tgz)
protocol_dist="$TEMP_DIR/extract-$protocol_name/package/dist"

if [ -d "$protocol_dist" ]; then
  # Check that verify-local.js exists and exports verifyLocal
  if [ -f "$protocol_dist/verify-local.js" ] && grep -q "verifyLocal" "$protocol_dist/verify-local.js" 2>/dev/null; then
    echo "   OK: verify-local.js contains verifyLocal"
  else
    echo "   FAIL: verifyLocal not found in dist"
    FAILED=1
  fi

  # Check that index.js re-exports verify-local
  if grep -q "verify-local" "$protocol_dist/index.js" 2>/dev/null; then
    echo "   OK: index.js re-exports verify-local"
  else
    echo "   FAIL: index.js does not re-export verify-local"
    FAILED=1
  fi
else
  echo "   FAIL: dist directory not found"
  FAILED=1
fi

if [ "$FAILED" -eq 1 ]; then
  echo ""
  echo "FAIL: Export verification failed"
  exit 1
fi

echo ""
echo "=== Pack Verification PASSED ==="
