#!/usr/bin/env node
/**
 * Validates version consistency across the monorepo.
 *
 * Checks:
 *   1. All workspace packages (except examples at 0.0.0) match root version
 *   2. publish-manifest.json version matches root version
 *   3. No workspace package is stuck at a previous version
 *
 * Usage:
 *   node scripts/check-version-sync.mjs
 *
 * Exit codes:
 *   0 - All versions in sync
 *   1 - Version mismatch found
 */

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

console.log('PEAC Protocol - Version Sync Check');
console.log('===================================');

// 1. Read root version
const rootPkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf-8'));
const rootVersion = rootPkg.version;
console.log(`Root version: ${rootVersion}`);
console.log('');

const errors = [];

// 2. Check publish-manifest.json version
const manifestPath = join(__dirname, 'publish-manifest.json');
if (existsSync(manifestPath)) {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
  if (manifest.version !== rootVersion) {
    errors.push(
      `publish-manifest.json: version "${manifest.version}" != root "${rootVersion}"`
    );
  }
}

// 3. Check all workspace packages
let pnpmOutput;
try {
  pnpmOutput = execFileSync('pnpm', ['-r', 'list', '--json', '--depth', '-1'], {
    cwd: ROOT,
    encoding: 'utf-8',
  });
} catch {
  console.error('ERROR: Failed to run pnpm -r list --json');
  process.exit(1);
}

const workspacePackages = JSON.parse(pnpmOutput);
if (!Array.isArray(workspacePackages)) {
  console.error('ERROR: Unexpected pnpm output format');
  process.exit(1);
}

let checked = 0;
let skippedExamples = 0;

for (const pkg of workspacePackages) {
  if (typeof pkg !== 'object' || pkg === null) continue;
  if (typeof pkg.name !== 'string' || typeof pkg.version !== 'string') continue;

  // Skip the root package (already checked)
  if (pkg.name === rootPkg.name) continue;

  const relPath = relative(ROOT, pkg.path || '');

  // Examples must be at 0.0.0 (type-check only, not published)
  if (relPath.startsWith('examples/')) {
    if (pkg.version === '0.0.0') {
      skippedExamples++;
    } else {
      errors.push(`${pkg.name} (${relPath}): version "${pkg.version}" -- examples must be 0.0.0`);
    }
    continue;
  }

  if (pkg.version !== rootVersion) {
    errors.push(`${pkg.name} (${relPath}): version "${pkg.version}" != root "${rootVersion}"`);
  }
  checked++;
}

console.log(`Checked: ${checked} packages`);
console.log(`Skipped: ${skippedExamples} examples at 0.0.0`);
console.log('');

if (errors.length === 0) {
  console.log('OK: All versions in sync');
  process.exit(0);
} else {
  console.log(`FAIL: ${errors.length} version mismatch(es):`);
  console.log('');
  for (const err of errors) {
    console.log(`  ${err}`);
  }
  console.log('');
  console.log('Fix: Run node scripts/bump-version.mjs <version>');
  process.exit(1);
}
