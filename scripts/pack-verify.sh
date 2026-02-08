#!/bin/bash
# Pack verification gate (manifest-driven)
#
# Reads packages from scripts/publish-manifest.json and verifies:
#   1. No unresolved workspace:* dependencies in tarballs
#   2. No planning artifacts, .env, or test fixtures in tarballs
#   3. @peac/* deps in tarballs have resolved version numbers
#
# Run: bash scripts/pack-verify.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
TEMP_DIR=$(mktemp -d)
MANIFEST="$ROOT_DIR/scripts/publish-manifest.json"

cleanup() {
  rm -rf "$TEMP_DIR"
}
trap cleanup EXIT

echo "=== Pack Verification Gate ==="
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

  # Check tarball hygiene: no planning artifacts, build cache, or sensitive files
  BAD_FILES=$(tar -tzf "$tarball" | grep -E '(reference/|\.local\.md$|\.env|\.tsbuildinfo$|node_modules/|\.turbo/|\.log$)' || true)
  if [ -n "$BAD_FILES" ]; then
    echo "   FAIL: $pkg_name contains disallowed files:"
    echo "$BAD_FILES" | sed 's/^/      /' | head -10
    FAILED=1
  fi

  # Warn if LICENSE is missing from tarball (compliance)
  HAS_LICENSE=$(tar -tzf "$tarball" | grep -i '^package/LICENSE' || true)
  if [ -z "$HAS_LICENSE" ]; then
    echo "      WARN: no LICENSE file in tarball"
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
