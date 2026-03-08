/**
 * Publish-Manifest Invariant Check
 *
 * Validates structural invariants of scripts/publish-manifest.json:
 *   1. No duplicates within any array
 *   2. No overlaps between mutually exclusive arrays
 *   3. Every packages[] entry must be in oidcConfigured[]
 *   4. pendingTrustedPublishing must not overlap oidcConfigured
 *   5. deferredTrustedPublishing must not overlap packages[]
 *   6. Every packages[] entry resolves to a real workspace package
 *
 * Run: npx tsx scripts/check-manifest-invariants.ts
 *
 * Exits 0 if all invariants hold, 1 if not.
 */

import * as fs from 'fs';
import * as path from 'path';

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
  for (const pkg of manifest.packages) {
    if (!oidcSet.has(pkg)) {
      errors.push(`MISSING_OIDC: ${pkg} is in packages[] but not in oidcConfigured[]`);
    }
  }
}

// --- 4. Every packages[] entry resolves to a workspace package ---

// Nested layout mappings (same as check-publish-closure.ts)
const nestedMappings: Record<string, string> = {
  'adapter-core': 'packages/adapters/core',
  'adapter-openclaw': 'packages/adapters/openclaw',
  'adapter-x402': 'packages/adapters/x402',
  'adapter-x402-daydreams': 'packages/adapters/x402-daydreams',
  'adapter-x402-fluora': 'packages/adapters/x402-fluora',
  'adapter-x402-pinata': 'packages/adapters/x402-pinata',
  'adapter-openai-compatible': 'packages/adapters/openai-compatible',
  'adapter-eat': 'packages/adapters/eat',
  'rails-x402': 'packages/rails/x402',
  'rails-stripe': 'packages/rails/stripe',
  'rails-card': 'packages/rails/card',
  'rails-razorpay': 'packages/rails/razorpay',
  'mappings-mcp': 'packages/mappings/mcp',
  'mappings-a2a': 'packages/mappings/a2a',
  'mappings-acp': 'packages/mappings/acp',
  'mappings-aipref': 'packages/mappings/aipref',
  'mappings-rsl': 'packages/mappings/rsl',
  'mappings-tap': 'packages/mappings/tap',
  'mappings-ucp': 'packages/mappings/ucp',
  'mappings-content-signals': 'packages/mappings/content-signals',
  'capture-core': 'packages/capture/core',
  'capture-node': 'packages/capture/node',
  'sdk-js': 'packages/sdk-js',
  'net-node': 'packages/net/node',
  disc: 'packages/discovery',
};

function resolvePackageDir(npmName: string): string {
  const shortName = npmName.replace('@peac/', '');
  const flatDir = path.join(ROOT, 'packages', shortName);
  if (fs.existsSync(path.join(flatDir, 'package.json'))) {
    return flatDir;
  }
  if (nestedMappings[shortName]) {
    return path.join(ROOT, nestedMappings[shortName]);
  }
  return flatDir;
}

for (const pkg of manifest.packages) {
  const dir = resolvePackageDir(pkg);
  const pkgJson = path.join(dir, 'package.json');
  if (!fs.existsSync(pkgJson)) {
    errors.push(`MISSING_WORKSPACE: ${pkg} has no package.json at ${dir}`);
  }
}

// --- Summary ---

console.log(`Manifest invariant check: ${manifest.packages.length} packages`);
if (manifest.oidcConfigured) {
  console.log(`  oidcConfigured: ${manifest.oidcConfigured.length}`);
}
console.log(`  pendingTrustedPublishing: ${(manifest.pendingTrustedPublishing ?? []).length}`);
console.log(`  deferredTrustedPublishing: ${(manifest.deferredTrustedPublishing ?? []).length}`);

if (errors.length > 0) {
  console.log('');
  console.log(`FAIL: ${errors.length} invariant violation(s):`);
  for (const err of errors) {
    console.log(`  ${err}`);
  }
  process.exit(1);
} else {
  console.log('');
  console.log('OK: All manifest invariants hold.');
}
