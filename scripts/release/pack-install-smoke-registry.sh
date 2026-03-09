#!/usr/bin/env bash
set -euo pipefail

# Pack-Install Smoke Test: Post-Publish (Registry)
#
# Installs packages from the npm registry and verifies:
# ESM import, CJS require, TypeScript types resolution, and CLI bin execution.
#
# By default, reads the full package list from scripts/publish-manifest.json.
# Use --representative for a fast 5-package layer-spanning subset.
#
# This script should be run AFTER publishing to verify that packages resolve
# correctly from the public registry with all cross-dependencies satisfied.
# For pre-publish local tarball verification, see pack-install-smoke.sh.
#
# Usage:
#   bash scripts/release/pack-install-smoke-registry.sh
#   bash scripts/release/pack-install-smoke-registry.sh --dist-tag next
#   bash scripts/release/pack-install-smoke-registry.sh --representative
#
# Flags:
#   --dist-tag <tag>    Install from a specific dist-tag (default: latest)
#   --representative    Test only 5 representative packages (fast path)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$REPO_ROOT"

DIST_TAG="latest"
REPRESENTATIVE=false
while [[ $# -gt 0 ]]; do
  case "$1" in
    --dist-tag)
      DIST_TAG="$2"
      shift 2
      ;;
    --representative)
      REPRESENTATIVE=true
      shift
      ;;
    *)
      echo "Unknown option: $1" >&2
      echo "Usage: $0 [--dist-tag <tag>] [--representative]" >&2
      exit 1
      ;;
  esac
done

VERSION=$(node -p "require('./package.json').version")
MANIFEST="$REPO_ROOT/scripts/publish-manifest.json"
CONSUMER_DIR=$(mktemp -d)
FAILED=0
TOTAL_TESTED=0
TOTAL_BINS=0
WORKSPACE_CLEAN=true

cleanup() {
  rm -rf "$CONSUMER_DIR"
}
trap cleanup EXIT

# --- Build package list ---
SMOKE_PACKAGES=()
if $REPRESENTATIVE; then
  # Layer-spanning subset: L0 kernel, L1 schema, L2 crypto, L3 protocol, L5 mcp-server.
  # All are in the publish manifest and available on npm.
  SMOKE_PACKAGES=(
    "@peac/kernel"
    "@peac/schema"
    "@peac/crypto"
    "@peac/protocol"
    "@peac/mcp-server"
  )
  MODE="representative (${#SMOKE_PACKAGES[@]} packages)"
else
  while IFS= read -r line; do
    SMOKE_PACKAGES+=("$line")
  done < <(node -e "
    const m = JSON.parse(require('fs').readFileSync('$MANIFEST', 'utf-8'));
    m.packages.forEach(p => console.log(p));
  ")
  MODE="full manifest (${#SMOKE_PACKAGES[@]} packages)"
fi

echo "=== Pack-Install Smoke Test (Post-Publish: Registry) ==="
echo "  Version: $VERSION"
echo "  Dist-tag: $DIST_TAG"
echo "  Mode: $MODE"
echo ""

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

# --- Check for unresolved workspace dependencies ---
echo ""
echo "--- Workspace dependency check ---"
if grep -r "workspace:" node_modules/@peac/*/package.json 2>/dev/null; then
  echo "  FAIL: Found unresolved workspace:* dependencies"
  FAILED=$((FAILED + 1))
  WORKSPACE_CLEAN=false
else
  echo "  OK: No unresolved workspace dependencies"
fi

# --- Resolve bin names for packages that have them ---
resolve_bin_name() {
  local pkg_name="$1"
  local pkg_json="node_modules/$pkg_name/package.json"
  if [ ! -f "$pkg_json" ]; then
    echo ""
    return
  fi
  node -e '
    const p = require("./'$pkg_json'");
    const b = p.bin;
    if (b == null) process.exit(0);
    if (typeof b === "string") { process.stdout.write(p.name.split("/").pop()); process.exit(0); }
    const k = Object.keys(b)[0];
    if (k) process.stdout.write(k);
  ' 2>/dev/null || echo ""
}

# --- Verify each package ---
echo ""
echo "--- Verify ---"
for pkg_name in "${SMOKE_PACKAGES[@]}"; do
  echo -n "  [$pkg_name] "

  TOTAL_TESTED=$((TOTAL_TESTED + 1))

  # Verify installed version (handles strict exports maps that block /package.json)
  installed_version=$(node -e '
    try { console.log(require("'$pkg_name'/package.json").version); }
    catch { try { const fs = require("fs"); const p = JSON.parse(fs.readFileSync("node_modules/'$pkg_name'/package.json","utf-8")); console.log(p.version); }
    catch { console.log("unknown"); } }
  ' 2>/dev/null || echo "unknown")
  if [ "$installed_version" = "unknown" ]; then
    echo "FAIL (not installed)"
    FAILED=$((FAILED + 1))
    continue
  fi

  # Detect if this is a CLI-only package (has bin, no library exports)
  has_bin=false
  bin_ok=true
  bin_name=$(resolve_bin_name "$pkg_name")
  if [ -n "$bin_name" ]; then
    has_bin=true
    TOTAL_BINS=$((TOTAL_BINS + 1))
    ./node_modules/.bin/"$bin_name" --help > /dev/null 2>&1 || bin_ok=false
  fi

  # Check if package exports any library surface (some packages are CLI-only)
  has_exports=true
  node --input-type=module -e "
    const m = await import('$pkg_name');
    if (Object.keys(m).length === 0) process.exit(1);
  " > /dev/null 2>&1 || {
    has_exports=false
  }

  # For CLI-only packages: pass if bin works and types exist
  if $has_bin && ! $has_exports; then
    types_ok=true
    if ! find "node_modules/$pkg_name" -name '*.d.ts' -print -quit 2>/dev/null | grep -q .; then
      types_ok=false
    fi
    if $bin_ok; then
      types_label=""
      $types_ok && types_label=" +types"
      echo "PASS (v${installed_version}, cli-only +bin${types_label})"
    else
      echo "FAIL (v${installed_version}, cli-only -bin)"
      FAILED=$((FAILED + 1))
    fi
    continue
  fi

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

  # Test CJS require (skip for ESM-only packages)
  cjs_ok=true
  esm_only=false
  node -e "
    const m = require('$pkg_name');
    if (typeof m === 'undefined' || (typeof m === 'object' && Object.keys(m).length === 0)) throw new Error('empty');
  " > /dev/null 2>&1 || {
    # Check if the package is ESM-only (no require condition in exports)
    node -e '
      const fs = require("fs");
      const p = JSON.parse(fs.readFileSync("node_modules/'$pkg_name'/package.json","utf-8"));
      const e = p.exports && p.exports["."];
      if (e && typeof e === "object" && e.import && (e.require == null)) process.exit(0);
      process.exit(1);
    ' > /dev/null 2>&1 && {
      esm_only=true
      cjs_ok=true
    } || {
      cjs_ok=false
    }
  }

  # Test types existence
  types_ok=true
  if ! find "node_modules/$pkg_name" -name '*.d.ts' -print -quit 2>/dev/null | grep -q .; then
    types_ok=false
  fi

  if $esm_ok && $cjs_ok && $types_ok; then
    format_label="esm"
    if $esm_only; then
      format_label="esm-only"
    else
      format_label="esm +cjs"
    fi
    extras=""
    if $has_bin && $bin_ok; then
      extras=" +bin"
    elif $has_bin && ! $bin_ok; then
      extras=" -bin"
      FAILED=$((FAILED + 1))
    fi
    echo "PASS (v${installed_version}, ${format_label} +types${extras})"
  else
    failures=""
    $esm_ok || failures="${failures} esm"
    if ! $esm_only; then
      $cjs_ok || failures="${failures} cjs"
    fi
    $types_ok || failures="${failures} types"
    if $has_bin && ! $bin_ok; then
      failures="${failures} bin"
    fi
    echo "FAIL (v${installed_version}, ${failures# })"
    FAILED=$((FAILED + 1))
  fi
done

cd "$REPO_ROOT"

# --- Summary ---
echo ""
echo "--- Summary ---"
echo "  Packages tested: $TOTAL_TESTED"
echo "  Packages with bins: $TOTAL_BINS"
echo "  Workspace deps clean: $WORKSPACE_CLEAN"
echo "  Failures: $FAILED"
echo ""
if [ "$FAILED" -eq 0 ]; then
  echo "All registry smoke tests passed ($MODE)."
  exit 0
else
  echo "$FAILED check(s) failed registry smoke test ($MODE)."
  exit 1
fi
