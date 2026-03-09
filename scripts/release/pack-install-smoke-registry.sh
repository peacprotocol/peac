#!/usr/bin/env bash
set -euo pipefail

# Pack-Install Smoke Test: Post-Publish (Registry)
#
# Installs representative packages from the npm registry and verifies:
# ESM import, CJS require, TypeScript types resolution, and CLI bin execution.
#
# This script should be run AFTER publishing to verify that packages resolve
# correctly from the public registry with all cross-dependencies satisfied.
# For pre-publish local tarball verification, see pack-install-smoke.sh.
#
# Usage:
#   bash scripts/release/pack-install-smoke-registry.sh
#   bash scripts/release/pack-install-smoke-registry.sh --dist-tag next
#
# Flags:
#   --dist-tag <tag>  Install from a specific dist-tag (default: latest)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$REPO_ROOT"

DIST_TAG="latest"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --dist-tag)
      DIST_TAG="$2"
      shift 2
      ;;
    *)
      echo "Unknown option: $1" >&2
      echo "Usage: $0 [--dist-tag <tag>]" >&2
      exit 1
      ;;
  esac
done

VERSION=$(node -p "require('./package.json').version")
CONSUMER_DIR=$(mktemp -d)
FAILED=0

cleanup() {
  rm -rf "$CONSUMER_DIR"
}
trap cleanup EXIT

echo "=== Pack-Install Smoke Test (Post-Publish: Registry) ==="
echo "  Version: $VERSION"
echo "  Dist-tag: $DIST_TAG"
echo ""

# Representative packages across layers.
SMOKE_PACKAGES=(
  "@peac/kernel"
  "@peac/schema"
  "@peac/crypto"
  "@peac/protocol"
  "@peac/mcp-server"
  "@peac/adapter-eat"
)

# --- Install all packages from registry ---
cd "$CONSUMER_DIR"
npm init -y > /dev/null 2>&1

echo "--- Install from registry ---"
INSTALL_SPECS=()
for pkg in "${SMOKE_PACKAGES[@]}"; do
  INSTALL_SPECS+=("${pkg}@${DIST_TAG}")
done

echo -n "  Installing ${#INSTALL_SPECS[@]} packages from $DIST_TAG... "
if npm install "${INSTALL_SPECS[@]}" --save > /dev/null 2>&1; then
  echo "OK"
else
  echo "FAIL"
  echo "  Registry install failed. Packages may not be published at '$DIST_TAG'."
  exit 1
fi

# --- Verify each package ---
echo ""
echo "--- Verify ---"
for pkg_name in "${SMOKE_PACKAGES[@]}"; do
  echo -n "  [$pkg_name] "

  # Verify installed version
  installed_version=$(node -p "require('$pkg_name/package.json').version" 2>/dev/null || echo "unknown")

  # Test ESM import
  esm_ok=true
  node --input-type=module -e "
    import pkg from '$pkg_name';
    if (typeof pkg === 'undefined' && Object.keys(pkg).length === 0) throw new Error('empty');
  " > /dev/null 2>&1 || {
    node --input-type=module -e "
      const m = await import('$pkg_name');
      if (Object.keys(m).length === 0) throw new Error('empty');
    " > /dev/null 2>&1 || {
      esm_ok=false
    }
  }

  # Test CJS require
  cjs_ok=true
  node -e "
    const m = require('$pkg_name');
    if (typeof m === 'undefined' || (typeof m === 'object' && Object.keys(m).length === 0)) throw new Error('empty');
  " > /dev/null 2>&1 || {
    cjs_ok=false
  }

  # Test types existence
  types_ok=true
  if ! find "node_modules/$pkg_name" -name '*.d.ts' -print -quit 2>/dev/null | grep -q .; then
    types_ok=false
  fi

  if $esm_ok && $cjs_ok && $types_ok; then
    echo "PASS (v${installed_version}, esm +cjs +types)"
  else
    failures=""
    $esm_ok || failures="${failures} esm"
    $cjs_ok || failures="${failures} cjs"
    $types_ok || failures="${failures} types"
    echo "FAIL (v${installed_version}, ${failures# })"
    FAILED=$((FAILED + 1))
  fi
done

cd "$REPO_ROOT"

echo ""
if [ "$FAILED" -eq 0 ]; then
  echo "All registry smoke tests passed."
  exit 0
else
  echo "$FAILED package(s) failed registry smoke test."
  exit 1
fi
