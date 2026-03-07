#!/usr/bin/env bash
set -euo pipefail

# API Surface Lock Gate
#
# Extracts public export names from representative packages and compares
# against committed snapshots. Catches accidental API removals or renames
# that would break downstream consumers.
#
# Usage:
#   bash scripts/release/api-surface-lock.sh              # verify (exit 1 if drift)
#   bash scripts/release/api-surface-lock.sh --update      # regenerate snapshots
#
# Snapshots are stored in docs/releases/api-surface/

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$REPO_ROOT"

SURFACE_DIR="docs/releases/api-surface"
UPDATE=false

if [[ "${1:-}" == "--update" ]]; then
  UPDATE=true
fi

mkdir -p "$SURFACE_DIR"

# Representative packages whose public API surface we track
TRACKED_PACKAGES=(
  "@peac/kernel"
  "@peac/schema"
  "@peac/crypto"
  "@peac/protocol"
  "@peac/control"
  "@peac/middleware-core"
)

FAILED=0

extract_exports() {
  local pkg_name="$1"
  # Find the package directory in the pnpm workspace
  local pkg_dir
  pkg_dir=$(node -e "
    const fs = require('fs');
    const path = require('path');
    const root = '$REPO_ROOT';
    // Search common locations for workspace packages
    const dirs = ['packages', 'packages/adapters', 'packages/mappings', 'packages/rails'];
    for (const dir of dirs) {
      const base = path.join(root, dir);
      if (!fs.existsSync(base)) continue;
      for (const entry of fs.readdirSync(base)) {
        const pkgPath = path.join(base, entry, 'package.json');
        if (fs.existsSync(pkgPath)) {
          const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
          if (pkg.name === '$pkg_name') {
            process.stdout.write(path.join(base, entry));
            process.exit(0);
          }
        }
      }
    }
  " 2>/dev/null || echo "")

  if [ -z "$pkg_dir" ] || [ ! -d "$pkg_dir" ]; then
    echo "# $pkg_name: package not found"
    return
  fi

  # Find the types entry point from the dist output
  local types_file
  types_file=$(node -e "
    const path = require('path');
    const pkg = require(path.join('$pkg_dir', 'package.json'));
    let types = pkg.types || pkg.typings;
    if (!types && pkg.exports && pkg.exports['.']) {
      const dot = pkg.exports['.'];
      types = dot.types || (dot.import && dot.import.types) || (dot.require && dot.require.types);
    }
    if (types) process.stdout.write(path.resolve('$pkg_dir', types));
  " 2>/dev/null || echo "")

  if [ -z "$types_file" ] || [ ! -f "$types_file" ]; then
    echo "# $pkg_name: no types entry found"
    return
  fi

  # Extract exported identifiers from .d.ts
  # This is a simplified extraction; it captures the public API names
  node -e "
    const fs = require('fs');
    // Strip comment lines before extraction to avoid capturing @deprecated annotations
    const raw = fs.readFileSync('$types_file', 'utf8');
    const content = raw.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
    const exports = new Set();

    // Match: export { Name } or export { Name as Alias }
    const reExportBlock = /export\s*\{([^}]+)\}/g;
    let m;
    while ((m = reExportBlock.exec(content)) !== null) {
      m[1].split(',').forEach(item => {
        const name = item.trim().split(/\s+as\s+/).pop().trim();
        if (name && !name.startsWith('_') && /^\w+$/.test(name)) exports.add(name);
      });
    }

    // Match: export declare function/const/class/type/interface/enum Name
    const reDecl = /export\s+declare\s+(?:function|const|let|class|type|interface|enum|abstract\s+class)\s+(\w+)/g;
    while ((m = reDecl.exec(content)) !== null) {
      if (!m[1].startsWith('_')) exports.add(m[1]);
    }

    // Match: export type { Name }
    const reTypeExport = /export\s+type\s*\{([^}]+)\}/g;
    while ((m = reTypeExport.exec(content)) !== null) {
      m[1].split(',').forEach(item => {
        const name = item.trim().split(/\s+as\s+/).pop().trim();
        if (name && !name.startsWith('_')) exports.add(name);
      });
    }

    const sorted = Array.from(exports).sort();
    sorted.forEach(name => console.log(name));
  " 2>/dev/null || echo "# $pkg_name: extraction failed"
}

for pkg in "${TRACKED_PACKAGES[@]}"; do
  local_name=$(echo "$pkg" | sed 's/@peac\///')
  snapshot_file="$SURFACE_DIR/${local_name}.txt"

  echo -n "  [$pkg] "

  current=$(extract_exports "$pkg")

  if $UPDATE; then
    echo "$current" > "$snapshot_file"
    echo "UPDATED"
    continue
  fi

  if [ ! -f "$snapshot_file" ]; then
    echo "FAIL (no snapshot: run with --update to generate)"
    FAILED=$((FAILED + 1))
    continue
  fi

  previous=$(cat "$snapshot_file")

  if [ "$current" = "$previous" ]; then
    echo "PASS"
    continue
  fi

  # Find removals (in previous but not in current)
  removed=$(diff <(echo "$previous") <(echo "$current") 2>/dev/null | grep '^< ' | sed 's/^< //' || true)

  if [ -n "$removed" ]; then
    echo "FAIL (removed exports)"
    echo "$removed" | sed 's/^/    REMOVED: /'
    FAILED=$((FAILED + 1))
  else
    # Only additions: that's OK (non-breaking)
    echo "PASS (new exports added)"
    if $UPDATE; then
      echo "$current" > "$snapshot_file"
    fi
  fi
done

echo ""
if $UPDATE; then
  echo "API surface snapshots updated in $SURFACE_DIR/"
  exit 0
fi

if [ "$FAILED" -eq 0 ]; then
  echo "API surface lock: all tracked packages stable."
  exit 0
else
  echo "$FAILED package(s) have breaking API surface changes."
  echo "If intentional, run: bash scripts/release/api-surface-lock.sh --update"
  exit 1
fi
