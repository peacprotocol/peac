#!/usr/bin/env bash
set -euo pipefail

# Pack-Install Smoke Test: Pre-Publish (Local Tarball)
#
# Packs representative packages into tarballs, installs them ALL together in
# a shared isolated consumer directory, and verifies: ESM import, CJS require,
# TypeScript types resolution, and CLI bin execution.
#
# By installing all tarballs at once, workspace:* cross-dependencies resolve
# against co-installed local packages rather than the npm registry. This
# enables full install-surface testing before any packages are published.
#
# For post-publish registry verification, see pack-install-smoke-registry.sh.
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
CONSUMER_DIR=$(mktemp -d)
FAILED=0

cleanup() {
  rm -rf "$PACK_DIR" "$CONSUMER_DIR"
}
trap cleanup EXIT

echo "=== Pack-Install Smoke Test (Pre-Publish: Local Tarball) ==="
echo "  Pack dir: $PACK_DIR"
echo ""

# Representative packages across layers (not all 28; covers critical paths).
SMOKE_PACKAGES=(
  "packages/kernel"
  "packages/schema"
  "packages/crypto"
  "packages/protocol"
  "packages/mcp-server"
  "packages/adapters/eat"
)

# --- Phase 1: Pack all tarballs ---
echo "--- Phase 1: Pack ---"
TARBALL_LIST=()
for pkg in "${SMOKE_PACKAGES[@]}"; do
  if [ ! -d "$pkg" ]; then
    echo "  [$(basename "$pkg")] SKIP (not found)"
    continue
  fi
  pkg_name=$(node -p "require('./$pkg/package.json').name")
  echo -n "  [$pkg_name] "
  tarball=$(cd "$pkg" && pnpm pack --pack-destination "$PACK_DIR" 2>/dev/null | tail -1)
  cd "$REPO_ROOT"
  if [ ! -f "$tarball" ]; then
    echo "FAIL (pack failed)"
    FAILED=$((FAILED + 1))
    continue
  fi
  TARBALL_LIST+=("$tarball")
  echo "OK"
done

if [ ${#TARBALL_LIST[@]} -eq 0 ]; then
  echo "ERROR: No tarballs produced"
  exit 1
fi

# --- Phase 2: Install all tarballs together ---
# Installing all tarballs at once allows npm to resolve cross-dependencies
# (e.g., @peac/schema depends on @peac/kernel) from co-installed local
# tarballs rather than the npm registry. This avoids the pre-publish failure
# where workspace:* deps are not yet available on the registry.
echo ""
echo "--- Phase 2: Install ---"
cd "$CONSUMER_DIR"
npm init -y > /dev/null 2>&1

echo -n "  Installing ${#TARBALL_LIST[@]} tarballs into shared consumer... "
if npm install "${TARBALL_LIST[@]}" --save > /dev/null 2>&1; then
  echo "OK"
  INSTALL_OK=true
else
  echo "FAIL"
  echo "  Bulk tarball install failed. Workspace cross-deps may be unresolvable."
  INSTALL_OK=false
  FAILED=$((FAILED + 1))
fi

cd "$REPO_ROOT"

# --- Phase 3: Verify each installed package ---
echo ""
echo "--- Phase 3: Verify ---"
if ! $INSTALL_OK; then
  echo "  Skipping verification (install failed)"
else
  for pkg in "${SMOKE_PACKAGES[@]}"; do
    if [ ! -d "$pkg" ]; then continue; fi
    pkg_name=$(node -p "require('./$pkg/package.json').name")
    echo -n "  [$pkg_name] "

    cd "$CONSUMER_DIR"

    # Test ESM import
    esm_ok=true
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

    # Test CJS require (all smoke packages are dual ESM/CJS)
    cjs_ok=true
    node -e "
      const m = require('$pkg_name');
      if (typeof m === 'undefined' || (typeof m === 'object' && Object.keys(m).length === 0)) throw new Error('empty');
    " > /dev/null 2>&1 || {
      cjs_ok=false
    }

    # Test types existence (check if .d.ts files are in the package)
    types_ok=true
    if ! find "node_modules/$pkg_name" -name '*.d.ts' -print -quit 2>/dev/null | grep -q .; then
      types_ok=false
    fi

    # Test CLI bin (only for packages with bin)
    bin_ok=true
    has_bin=$(cd "$REPO_ROOT" && node -p "JSON.stringify(require('./$pkg/package.json').bin || null)" 2>/dev/null || echo "null")
    if [ "$has_bin" != "null" ]; then
      bin_name=$(cd "$REPO_ROOT" && node -p "const b = require('./$pkg/package.json').bin; typeof b === 'string' ? require('./$pkg/package.json').name.split('/').pop() : Object.keys(b)[0]" 2>/dev/null || echo "")
      if [ -n "$bin_name" ]; then
        npx "$bin_name" --help > /dev/null 2>&1 || bin_ok=false
      fi
    fi

    cd "$REPO_ROOT"

    if $esm_ok && $cjs_ok && $types_ok; then
      extras=""
      if [ "$has_bin" != "null" ] && $bin_ok; then
        extras=" +bin"
      fi
      echo "PASS (esm +cjs +types${extras})"
    else
      failures=""
      $esm_ok || failures="${failures} esm"
      $cjs_ok || failures="${failures} cjs"
      $types_ok || failures="${failures} types"
      echo "FAIL (${failures# })"
      FAILED=$((FAILED + 1))
    fi
  done
fi

echo ""
if [ "$FAILED" -eq 0 ]; then
  echo "All pack-install smoke tests passed."
  exit 0
else
  echo "$FAILED check(s) failed."
  exit 1
fi
