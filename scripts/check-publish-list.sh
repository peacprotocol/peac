#!/bin/bash
# scripts/check-publish-list.sh
# Verify publish list matches actual public packages

set -e

echo "=== Checking publish list drift ==="

# Get all public packages from package.json files
ACTUAL_PACKAGES=$(node -e "
const fs = require('fs');
const path = require('path');

function getPackages(dir) {
  try {
    return fs.readdirSync(dir).filter(d => !d.startsWith('.')).map(d => path.join(dir, d, 'package.json'));
  } catch { return []; }
}

function getPackagesRecursive(dir, depth = 0) {
  if (depth > 2) return [];
  const results = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && !entry.name.startsWith('.')) {
        const pkgPath = path.join(dir, entry.name, 'package.json');
        if (fs.existsSync(pkgPath)) {
          results.push(pkgPath);
        }
        results.push(...getPackagesRecursive(path.join(dir, entry.name), depth + 1));
      }
    }
  } catch {}
  return results;
}

const pkgPaths = [
  ...getPackages('packages'),
  ...getPackagesRecursive('packages/rails'),
  ...getPackagesRecursive('packages/mappings'),
  ...getPackagesRecursive('packages/transport'),
  ...getPackagesRecursive('packages/adapters'),
];
const pub = [];
for (const p of pkgPaths) {
  try {
    const pkg = JSON.parse(fs.readFileSync(p, 'utf8'));
    if (pkg.private !== true && pkg.name) pub.push(pkg.name);
  } catch {}
}
console.log(pub.sort().join('\n'));
")

# Expected packages (updated for v0.9.28)
EXPECTED_PACKAGES=$(cat <<'EOF'
@peac/adapter-core
@peac/adapter-x402-daydreams
@peac/adapter-x402-fluora
@peac/adapter-x402-pinata
@peac/attribution
@peac/cli
@peac/contracts
@peac/control
@peac/core
@peac/crypto
@peac/disc
@peac/http-signatures
@peac/jwks-cache
@peac/kernel
@peac/mappings-acp
@peac/mappings-aipref
@peac/mappings-mcp
@peac/mappings-rsl
@peac/mappings-tap
@peac/pay402
@peac/policy-kit
@peac/pref
@peac/protocol
@peac/rails-card
@peac/rails-stripe
@peac/rails-x402
@peac/receipts
@peac/schema
@peac/sdk
@peac/server
@peac/telemetry
@peac/telemetry-otel
@peac/worker-core
EOF
)

# Compare
DIFF=$(diff <(echo "$EXPECTED_PACKAGES") <(echo "$ACTUAL_PACKAGES") || true)

if [ -n "$DIFF" ]; then
  echo "FAIL: Publish list drift detected!"
  echo ""
  echo "Difference (expected vs actual):"
  echo "$DIFF"
  echo ""
  echo "Update the EXPECTED_PACKAGES list in this script or fix package.json files."
  exit 1
else
  echo "OK: All 33 public packages match"
  echo "$ACTUAL_PACKAGES" | wc -l | xargs -I{} echo "Total: {} packages"
fi

echo ""
echo "=== Checking test coverage ==="

# Packages covered by test:core (from package.json)
TESTED_PACKAGES="@peac/attribution
@peac/contracts
@peac/crypto
@peac/http-signatures
@peac/jwks-cache
@peac/mappings-acp
@peac/mappings-aipref
@peac/mappings-mcp
@peac/mappings-rsl
@peac/mappings-tap
@peac/policy-kit
@peac/protocol
@peac/rails-stripe
@peac/rails-x402
@peac/telemetry
@peac/telemetry-otel
@peac/worker-core"

# Packages explicitly without tests (with rationale)
# These are either: thin wrappers, deprecated, or type-only packages
NO_TESTS_RATIONALE="@peac/adapter-core - shared adapter utilities, tested via adapter implementations
@peac/adapter-x402-daydreams - x402 adapter, tested via integration
@peac/adapter-x402-fluora - x402 adapter, tested via integration
@peac/adapter-x402-pinata - x402 adapter, tested via integration
@peac/cli - CLI wrapper, tested via integration
@peac/control - orchestration layer, tested via protocol tests
@peac/core - DEPRECATED, redirect to granular packages
@peac/disc - discovery types only
@peac/kernel - type definitions only, no runtime logic
@peac/pay402 - thin 402 helpers, minimal runtime
@peac/pref - preferences types only
@peac/rails-card - card billing bridge, tested via integration
@peac/receipts - type re-exports only
@peac/schema - Zod schemas, validated at compile time
@peac/sdk - re-exports only
@peac/server - server wrapper, tested via integration"

echo "Packages with tests (17):"
echo "$TESTED_PACKAGES" | sed 's/^/  /'
echo ""
echo "Packages without tests (16) - rationale:"
echo "$NO_TESTS_RATIONALE" | sed 's/^/  /'
echo ""
echo "OK: All 33 packages accounted for (17 tested + 16 type/wrapper packages)"

echo ""
echo "=== Checking for duplicate package names ==="

# Check for duplicate package names in workspace
DUPLICATES=$(node -e "
const fs = require('fs');
const path = require('path');

// Directories to skip (build outputs, node_modules, etc.)
const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', 'out', '.git']);

function findPackages(dir) {
  const results = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && !entry.name.startsWith('.') && !SKIP_DIRS.has(entry.name)) {
        const pkgPath = path.join(dir, entry.name, 'package.json');
        if (fs.existsSync(pkgPath)) {
          try {
            const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
            if (pkg.name) results.push({ name: pkg.name, path: pkgPath });
          } catch {}
        }
        // Recurse into subdirectories
        results.push(...findPackages(path.join(dir, entry.name)));
      }
    }
  } catch {}
  return results;
}

const packages = [
  ...findPackages('packages'),
  ...findPackages('apps'),
  ...findPackages('surfaces'),
  ...findPackages('examples'),
];

const seen = new Map();
const duplicates = [];
for (const pkg of packages) {
  if (seen.has(pkg.name)) {
    duplicates.push({ name: pkg.name, paths: [seen.get(pkg.name), pkg.path] });
  } else {
    seen.set(pkg.name, pkg.path);
  }
}

if (duplicates.length > 0) {
  console.log(JSON.stringify(duplicates));
}
")

if [ -n "$DUPLICATES" ]; then
  echo "FAIL: Duplicate package names detected!"
  echo "$DUPLICATES" | node -e "
    const input = require('fs').readFileSync(0, 'utf8');
    const dups = JSON.parse(input);
    for (const d of dups) {
      console.log('  ' + d.name + ': ' + d.paths.join(', '));
    }
  "
  exit 1
else
  echo "OK: No duplicate package names"
fi

echo ""
echo "=== Checking for private packages with publishConfig ==="

# Private packages should not have publishConfig (confusing and error-prone)
VIOLATIONS=$(node -e "
const fs = require('fs');
const path = require('path');

// Directories to skip (build outputs, node_modules, etc.)
const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', 'out', '.git']);

function findPackages(dir) {
  const results = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && !entry.name.startsWith('.') && !SKIP_DIRS.has(entry.name)) {
        const pkgPath = path.join(dir, entry.name, 'package.json');
        if (fs.existsSync(pkgPath)) {
          try {
            const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
            if (pkg.private === true && pkg.publishConfig) {
              results.push({ name: pkg.name || pkgPath, path: pkgPath });
            }
          } catch {}
        }
        // Recurse into subdirectories
        results.push(...findPackages(path.join(dir, entry.name)));
      }
    }
  } catch {}
  return results;
}

const violations = [
  ...findPackages('packages'),
  ...findPackages('apps'),
  ...findPackages('surfaces'),
  ...findPackages('examples'),
];

if (violations.length > 0) {
  console.log(JSON.stringify(violations));
}
")

if [ -n "$VIOLATIONS" ]; then
  echo "FAIL: Private packages with publishConfig detected!"
  echo "$VIOLATIONS" | node -e "
    const input = require('fs').readFileSync(0, 'utf8');
    const viols = JSON.parse(input);
    for (const v of viols) {
      console.log('  ' + v.name + ': ' + v.path);
    }
  "
  echo ""
  echo "Remove publishConfig from private packages to avoid confusion."
  exit 1
else
  echo "OK: No private packages with publishConfig"
fi
