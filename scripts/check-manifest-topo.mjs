#!/usr/bin/env node
/**
 * Validates that publish-manifest.json has correct topological order.
 *
 * For every package in the manifest, all its @peac/* dependencies must
 * appear EARLIER in the list. This prevents publish failures due to
 * missing dependencies.
 *
 * Usage:
 *   node scripts/check-manifest-topo.mjs
 *
 * Exit codes:
 *   0 - Topological order is valid
 *   1 - Order violation found (dependency appears after dependent)
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const MANIFEST_PATH = join(__dirname, 'publish-manifest.json');

console.log('PEAC Protocol - Manifest Topological Order Check');
console.log('=================================================');

// Load manifest
if (!existsSync(MANIFEST_PATH)) {
  console.error('ERROR: scripts/publish-manifest.json not found');
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf-8'));
const packages = manifest.packages;

if (!packages || !Array.isArray(packages)) {
  console.error('ERROR: Invalid manifest (missing packages array)');
  process.exit(1);
}

console.log(`Checking ${packages.length} packages...`);
console.log('');

// Use pnpm to find all workspace packages and their paths
let pnpmOutput;
try {
  pnpmOutput = execFileSync('pnpm', ['-r', 'list', '--json', '--depth', '-1'], {
    cwd: ROOT,
    encoding: 'utf-8',
  });
} catch (err) {
  console.error('ERROR: Failed to run pnpm');
  console.error('');
  console.error('pnpm is required to check manifest topological order.');
  console.error('In CI, ensure setup-pnpm runs before this step.');
  console.error('');
  console.error('Details:', err.message);
  process.exit(1);
}

let workspacePackages;
try {
  workspacePackages = JSON.parse(pnpmOutput);
} catch (err) {
  console.error('ERROR: Failed to parse pnpm output as JSON');
  console.error('');
  console.error('The pnpm list command returned invalid JSON.');
  console.error('This may indicate a pnpm version incompatibility.');
  console.error('');
  console.error('Details:', err.message);
  process.exit(1);
}

// Validate pnpm output structure (should be an array of package objects)
if (!Array.isArray(workspacePackages)) {
  console.error('ERROR: Unexpected pnpm output format');
  console.error('');
  console.error('Expected an array from pnpm -r list --json, got:', typeof workspacePackages);
  console.error('This may indicate a pnpm version incompatibility.');
  process.exit(1);
}

const packagePathMap = new Map();

for (const pkg of workspacePackages) {
  // Validate each entry has expected shape
  if (typeof pkg !== 'object' || pkg === null) continue;
  if (typeof pkg.name !== 'string' || typeof pkg.path !== 'string') continue;

  if (pkg.name.startsWith('@peac/')) {
    packagePathMap.set(pkg.name, pkg.path);
  }
}

// Build position map
const positionMap = new Map();
packages.forEach((name, index) => {
  positionMap.set(name, index);
});

// Check each package's dependencies
const violations = [];
let checkedCount = 0;

for (let i = 0; i < packages.length; i++) {
  const pkgName = packages[i];
  const pkgPath = packagePathMap.get(pkgName);

  if (!pkgPath) {
    console.log(`  SKIP: ${pkgName} (not found in workspace)`);
    continue;
  }

  const pkgJsonPath = join(pkgPath, 'package.json');
  if (!existsSync(pkgJsonPath)) {
    console.log(`  SKIP: ${pkgName} (package.json not found)`);
    continue;
  }

  const pkgJson = JSON.parse(readFileSync(pkgJsonPath, 'utf-8'));
  const deps = { ...pkgJson.dependencies, ...pkgJson.peerDependencies };
  checkedCount++;

  // Check each @peac/* dependency
  for (const dep of Object.keys(deps)) {
    if (!dep.startsWith('@peac/')) continue;

    const depPosition = positionMap.get(dep);

    // Dependency must be in manifest and appear earlier
    if (depPosition === undefined) {
      // Dependency not in manifest - might be private package, skip
      continue;
    }

    if (depPosition >= i) {
      violations.push({
        package: pkgName,
        position: i + 1, // 1-indexed for display
        dependency: dep,
        depPosition: depPosition + 1, // 1-indexed for display
      });
    }
  }
}

console.log(`Checked ${checkedCount} packages`);
console.log('');

if (violations.length === 0) {
  console.log('OK: All packages have valid topological order');
  console.log('   Dependencies appear before dependents in manifest.');
  process.exit(0);
} else {
  console.log('ERROR: Topological order violations found:');
  console.log('');
  for (const v of violations) {
    console.log(`  ${v.package} (position ${v.position})`);
    console.log(`    depends on ${v.dependency} (position ${v.depPosition})`);
    console.log(`    -> ${v.dependency} must appear BEFORE ${v.package}`);
    console.log('');
  }
  console.log('Fix: Reorder packages in scripts/publish-manifest.json');
  console.log('     Dependencies must come before packages that depend on them.');
  process.exit(1);
}
