#!/usr/bin/env node
/**
 * Version sync gate for PEAC Protocol
 *
 * Verifies all public packages have the same version as the target version.
 * Used in CI preflight to prevent publishing packages with mismatched versions.
 *
 * Usage:
 *   node scripts/check-package-versions.mjs <expected-version>
 *
 * Examples:
 *   node scripts/check-package-versions.mjs 0.10.4
 *   node scripts/check-package-versions.mjs $(node -p "require('./package.json').version")
 *
 * Exit codes:
 *   0 - All versions match
 *   1 - Version mismatch found or error
 */

import { execSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// Get expected version from args or root package.json
const expectedVersion = process.argv[2] || JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf-8')).version;

if (!expectedVersion) {
  console.error('ERROR: No expected version provided');
  console.error('Usage: node scripts/check-package-versions.mjs <version>');
  process.exit(1);
}

console.log('PEAC Protocol - Version Sync Gate');
console.log('==================================');
console.log(`Expected version: ${expectedVersion}`);
console.log('');

/**
 * Find all workspace packages via pnpm
 */
function findWorkspacePackages() {
  const output = execSync('pnpm -r list --json --depth -1', {
    cwd: ROOT,
    encoding: 'utf-8',
  });

  return JSON.parse(output)
    .filter((pkg) => pkg.name && pkg.name.startsWith('@peac/'))
    .map((pkg) => ({
      name: pkg.name,
      path: pkg.path,
    }));
}

/**
 * Check if package is public (not private)
 */
function isPublic(pkgPath) {
  const pkgJson = join(pkgPath, 'package.json');
  if (!existsSync(pkgJson)) return false;

  const pkg = JSON.parse(readFileSync(pkgJson, 'utf-8'));
  return pkg.private !== true;
}

/**
 * Get package version
 */
function getVersion(pkgPath) {
  const pkgJson = join(pkgPath, 'package.json');
  const pkg = JSON.parse(readFileSync(pkgJson, 'utf-8'));
  return pkg.version;
}

// Find all packages
const allPackages = findWorkspacePackages();
const publicPackages = allPackages.filter((pkg) => isPublic(pkg.path));

console.log(`Found ${publicPackages.length} public packages`);
console.log('');

// Check versions
const mismatches = [];
const correct = [];

for (const pkg of publicPackages) {
  const version = getVersion(pkg.path);
  if (version !== expectedVersion) {
    mismatches.push({ name: pkg.name, version, expected: expectedVersion });
  } else {
    correct.push(pkg.name);
  }
}

// Report results
if (mismatches.length === 0) {
  console.log(`OK: All ${publicPackages.length} packages have version ${expectedVersion}`);
  process.exit(0);
} else {
  console.log('ERROR: Version mismatches found:');
  console.log('');
  for (const m of mismatches) {
    console.log(`  ${m.name}: ${m.version} (expected ${m.expected})`);
  }
  console.log('');
  console.log(`${correct.length} packages OK, ${mismatches.length} mismatches`);
  console.log('');
  console.log('Fix: Run version bump script or update individual packages');
  process.exit(1);
}
