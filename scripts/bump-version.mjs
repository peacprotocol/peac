#!/usr/bin/env node
/**
 * Bumps all workspace package versions to a target version.
 *
 * Reads workspace packages from pnpm, updates each package.json via
 * JSON parse/write (not regex), and bumps publish-manifest.json.
 *
 * Convention: examples/ stay at 0.0.0 (type-check only, not published).
 *
 * Usage:
 *   node scripts/bump-version.mjs 0.10.11
 *   node scripts/bump-version.mjs 0.10.11 --dry-run
 *
 * Exit codes:
 *   0 - All packages bumped (or --dry-run)
 *   1 - Error or missing argument
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const version = args.find((a) => !a.startsWith('--'));

if (!version) {
  console.error('Usage: node scripts/bump-version.mjs <version> [--dry-run]');
  process.exit(1);
}

// Validate semver-ish format
if (!/^\d+\.\d+\.\d+/.test(version)) {
  console.error(`ERROR: "${version}" does not look like a valid version`);
  process.exit(1);
}

console.log(`PEAC Protocol - Version Bump${dryRun ? ' (DRY RUN)' : ''}`);
console.log(`Target: ${version}`);
console.log('');

// Helper: update version in a package.json (preserves formatting)
function bumpPackageJson(filePath, targetVersion) {
  const raw = readFileSync(filePath, 'utf-8');
  const pkg = JSON.parse(raw);

  if (pkg.version === targetVersion) {
    return { status: 'already', name: pkg.name };
  }

  const oldVersion = pkg.version;
  pkg.version = targetVersion;

  // Preserve original formatting (detect indent)
  const indent = raw.match(/^(\s+)"/m)?.[1] || '  ';
  const newRaw = JSON.stringify(pkg, null, indent) + '\n';

  if (!dryRun) {
    writeFileSync(filePath, newRaw);
  }

  return { status: 'bumped', name: pkg.name, from: oldVersion };
}

// 1. Bump root package.json
const rootResult = bumpPackageJson(join(ROOT, 'package.json'), version);
console.log(`  root: ${rootResult.status === 'bumped' ? `${rootResult.from} -> ${version}` : 'already at ' + version}`);

// 2. Enumerate workspace packages via pnpm
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

let bumped = 0;
let skippedExamples = 0;
let alreadyCurrent = 0;

for (const pkg of workspacePackages) {
  if (typeof pkg !== 'object' || pkg === null) continue;
  if (typeof pkg.name !== 'string' || typeof pkg.path !== 'string') continue;

  const relPath = relative(ROOT, pkg.path);
  const pkgJsonPath = join(pkg.path, 'package.json');

  if (!existsSync(pkgJsonPath)) continue;

  // Skip root (already bumped above)
  const rootPkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf-8'));
  if (pkg.name === rootPkg.name) continue;

  // Examples stay at 0.0.0 by convention
  if (relPath.startsWith('examples/')) {
    const exPkg = JSON.parse(readFileSync(pkgJsonPath, 'utf-8'));
    if (exPkg.version === '0.0.0') {
      skippedExamples++;
      continue;
    }
  }

  const result = bumpPackageJson(pkgJsonPath, version);
  if (result.status === 'bumped') {
    bumped++;
  } else {
    alreadyCurrent++;
  }
}

// 3. Bump publish-manifest.json
const manifestPath = join(__dirname, 'publish-manifest.json');
if (existsSync(manifestPath)) {
  const raw = readFileSync(manifestPath, 'utf-8');
  const manifest = JSON.parse(raw);
  const oldManifestVersion = manifest.version;
  manifest.version = version;
  manifest.lastUpdated = new Date().toISOString().split('T')[0];

  if (!dryRun) {
    writeFileSync(manifestPath, JSON.stringify(manifest, null, '  ') + '\n');
  }

  if (oldManifestVersion !== version) {
    console.log(`  publish-manifest.json: ${oldManifestVersion} -> ${version}`);
  }
}

console.log('');
console.log(`Bumped: ${bumped} packages`);
console.log(`Already current: ${alreadyCurrent}`);
console.log(`Skipped examples (0.0.0): ${skippedExamples}`);

if (dryRun) {
  console.log('');
  console.log('(dry run -- no files written)');
}

console.log('');
console.log('Next: verify with node scripts/check-version-sync.mjs');
