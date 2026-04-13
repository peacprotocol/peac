/**
 * Publish-Manifest Invariant Check
 *
 * Validates structural invariants of scripts/publish-manifest.json:
 *   1. No duplicates within any array
 *   2. No overlaps between mutually exclusive arrays
 *   3. Every packages[] entry must be in oidcConfigured[]
 *   4. pendingTrustedPublishing must not overlap oidcConfigured
 *   5. deferredTrustedPublishing must not overlap packages[]
 *   6. Every entry in all arrays resolves to a real workspace package
 *   7. pendingTrustedPublishing must be empty for stable scope
 *
 * Run: npx tsx scripts/check-manifest-invariants.ts
 *
 * Exits 0 if all invariants hold, 1 if not.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { resolvePackagePath } from './lib/resolve-package-path.js';

const ROOT = path.resolve(__dirname, '..');
const MANIFEST_PATH = path.join(ROOT, 'scripts/publish-manifest.json');

interface Manifest {
  packages: string[];
  oidcConfigured?: string[];
  pendingTrustedPublishing?: string[];
  deferredTrustedPublishing?: string[];
}

const manifest: Manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));

const errors: string[] = [];

// --- 1. No duplicates within any array ---

function checkDuplicates(name: string, arr: string[]): void {
  const seen = new Set<string>();
  for (const item of arr) {
    if (seen.has(item)) {
      errors.push(`DUPLICATE in ${name}: ${item}`);
    }
    seen.add(item);
  }
}

checkDuplicates('packages', manifest.packages);
checkDuplicates('oidcConfigured', manifest.oidcConfigured ?? []);
checkDuplicates('pendingTrustedPublishing', manifest.pendingTrustedPublishing ?? []);
checkDuplicates('deferredTrustedPublishing', manifest.deferredTrustedPublishing ?? []);

// --- 2. No overlaps between mutually exclusive arrays ---

function checkNoOverlap(nameA: string, a: string[], nameB: string, b: string[]): void {
  const setB = new Set(b);
  for (const item of a) {
    if (setB.has(item)) {
      errors.push(`OVERLAP: ${item} is in both ${nameA} and ${nameB}`);
    }
  }
}

checkNoOverlap(
  'pendingTrustedPublishing',
  manifest.pendingTrustedPublishing ?? [],
  'oidcConfigured',
  manifest.oidcConfigured ?? []
);

checkNoOverlap(
  'deferredTrustedPublishing',
  manifest.deferredTrustedPublishing ?? [],
  'packages',
  manifest.packages
);

checkNoOverlap(
  'pendingTrustedPublishing',
  manifest.pendingTrustedPublishing ?? [],
  'deferredTrustedPublishing',
  manifest.deferredTrustedPublishing ?? []
);

// --- 3. Every packages[] entry must be in oidcConfigured[] ---

if (manifest.oidcConfigured) {
  const oidcSet = new Set(manifest.oidcConfigured);
  const pendingSet = new Set(manifest.pendingTrustedPublishing ?? []);
  const deferredSet = new Set(manifest.deferredTrustedPublishing ?? []);
  for (const pkg of manifest.packages) {
    if (!oidcSet.has(pkg) && !pendingSet.has(pkg) && !deferredSet.has(pkg)) {
      errors.push(
        `MISSING_OIDC: ${pkg} is in packages[] but not in oidcConfigured[], pendingTrustedPublishing[], or deferredTrustedPublishing[]`
      );
    }
  }
}

// --- 4. Every entry in all arrays resolves to a workspace package ---
// Uses shared resolver from scripts/lib/resolve-package-path.ts

function checkWorkspaceResolution(name: string, arr: string[]): void {
  for (const pkg of arr) {
    const dir = resolvePackagePath(pkg);
    const pkgJson = path.join(dir, 'package.json');
    if (!fs.existsSync(pkgJson)) {
      errors.push(
        `MISSING_WORKSPACE: ${pkg} (in ${name}) has no package.json at ${path.relative(ROOT, dir)}`
      );
    }
  }
}

checkWorkspaceResolution('packages', manifest.packages);
checkWorkspaceResolution('oidcConfigured', manifest.oidcConfigured ?? []);
checkWorkspaceResolution('pendingTrustedPublishing', manifest.pendingTrustedPublishing ?? []);
checkWorkspaceResolution('deferredTrustedPublishing', manifest.deferredTrustedPublishing ?? []);

// --- Summary ---

const pending = manifest.pendingTrustedPublishing ?? [];
const deferred = manifest.deferredTrustedPublishing ?? [];

console.log(`Manifest invariant check: ${manifest.packages.length} packages`);
if (manifest.oidcConfigured) {
  console.log(`  oidcConfigured: ${manifest.oidcConfigured.length}`);
}
console.log(`  pendingTrustedPublishing: ${pending.length}`);
console.log(`  deferredTrustedPublishing: ${deferred.length}`);

if (errors.length > 0) {
  console.log('');
  console.log(`FAIL: ${errors.length} invariant violation(s):`);
  for (const err of errors) {
    console.log(`  ${err}`);
  }
  process.exit(1);
}

console.log('');
if (pending.length === 0) {
  console.log('OK: All manifest invariants hold. Stable scope fully covered.');
} else {
  console.log(
    `OK: All manifest invariants hold. ${pending.length} package(s) pending trust configuration.`
  );
}
