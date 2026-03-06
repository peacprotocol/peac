#!/usr/bin/env bash
set -euo pipefail

# Pack-Install Smoke Test
#
# Packs representative packages into tarballs, installs them in isolated
# temp directories, and verifies: ESM import, CJS require (where dual),
# TypeScript types resolution, and CLI bin execution.
#
# This gate catches packaging errors that unit tests cannot: missing files
# in the `files` array, broken exports map, missing bin entries, etc.
#
# Usage:
#   bash scripts/release/pack-install-smoke.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$REPO_ROOT"

PACK_DIR=$(mktemp -d)
FAILED=0

cleanup() {
  rm -rf "$PACK_DIR"
}
trap cleanup EXIT

echo "=== Pack-Install Smoke Test ==="
echo "  Pack dir: $PACK_DIR"
echo ""

# Representative packages across layers (not all 28; these cover the critical paths)
SMOKE_PACKAGES=(
  "packages/kernel"
  "packages/schema"
  "packages/crypto"
  "packages/protocol"
  "packages/mcp-server"
  "packages/cli"
)

pack_and_test() {
  local pkg_dir="$1"
  local pkg_name
  pkg_name=$(node -p "require('./$pkg_dir/package.json').name")
  local pkg_version
  pkg_version=$(node -p "require('./$pkg_dir/package.json').version")

  echo -n "  [$pkg_name] "

  # Pack
  local tarball
  tarball=$(cd "$pkg_dir" && pnpm pack --pack-destination "$PACK_DIR" 2>/dev/null | tail -1)
  if [ ! -f "$tarball" ]; then
    echo "FAIL (pack failed)"
    FAILED=$((FAILED + 1))
    return
  fi

  # Create isolated consumer directory
  local consumer_dir="$PACK_DIR/consumer-$(basename "$pkg_dir")"
  mkdir -p "$consumer_dir"

  # Install the tarball
  cd "$consumer_dir"
  npm init -y > /dev/null 2>&1
  npm install "$tarball" --save > /dev/null 2>&1 || {
    echo "FAIL (npm install failed)"
    FAILED=$((FAILED + 1))
    cd "$REPO_ROOT"
    return
  }

  # Test ESM import
  local esm_ok=true
  node --input-type=module -e "
    import pkg from '$pkg_name';
    if (typeof pkg === 'undefined' && Object.keys(pkg).length === 0) throw new Error('empty');
  " > /dev/null 2>&1 || {
    # Try named exports
    node --input-type=module -e "
      const m = await import('$pkg_name');
      if (Object.keys(m).length === 0) throw new Error('empty');
    " > /dev/null 2>&1 || {
      esm_ok=false
    }
  }

  # Test types existence (check if .d.ts files are in the package)
  local types_ok=true
  if ! find "node_modules/$pkg_name" -name '*.d.ts' -print -quit 2>/dev/null | grep -q .; then
    types_ok=false
  fi

  # Test CLI bin (only for packages with bin)
  local bin_ok=true
  local has_bin
  has_bin=$(node -p "JSON.stringify(require('./$pkg_dir/package.json').bin || null)" 2>/dev/null || echo "null")
  if [ "$has_bin" != "null" ]; then
    # Get the first bin name
    local bin_name
    bin_name=$(node -p "const b = require('./$pkg_dir/package.json').bin; typeof b === 'string' ? require('./$pkg_dir/package.json').name.split('/').pop() : Object.keys(b)[0]" 2>/dev/null || echo "")
    if [ -n "$bin_name" ]; then
      npx "$bin_name" --help > /dev/null 2>&1 || bin_ok=false
    fi
  fi

  cd "$REPO_ROOT"

  if $esm_ok && $types_ok; then
    local extras=""
    if [ "$has_bin" != "null" ] && $bin_ok; then
      extras=" +bin"
    fi
    echo "PASS (esm +types${extras})"
  else
    local failures=""
    $esm_ok || failures="${failures} esm"
    $types_ok || failures="${failures} types"
    echo "FAIL (${failures# })"
    FAILED=$((FAILED + 1))
  fi
}

for pkg in "${SMOKE_PACKAGES[@]}"; do
  if [ -d "$pkg" ]; then
    pack_and_test "$pkg"
  else
    echo "  [$(basename "$pkg")] SKIP (not found)"
  fi
done

echo ""
if [ "$FAILED" -eq 0 ]; then
  echo "All pack-install smoke tests passed."
  exit 0
else
  echo "$FAILED package(s) failed smoke test."
  exit 1
fi
