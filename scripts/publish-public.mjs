#!/usr/bin/env node
/**
 * Safe publish script for PEAC Protocol
 *
 * - Enumerates workspace packages
 * - Filters to public packages only (private !== true)
 * - Publishes in topological order (dependencies first)
 * - Reports results
 *
 * Usage:
 *   node scripts/publish-public.mjs [--dry-run] [--tag next]
 */

import { execSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// Parse args
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const TAG = args.find((a) => a.startsWith('--tag='))?.split('=')[1] || 'next';

// Layer order for topological publish (dependencies first)
const LAYER_ORDER = [
  // L0: Types and constants
  '@peac/kernel',
  // L1: Schemas
  '@peac/schema',
  // L2: Crypto
  '@peac/crypto',
  // L3: Protocol + Control
  '@peac/protocol',
  '@peac/control',
  // L4: Rails, Mappings, Security
  '@peac/http-signatures',
  '@peac/jwks-cache',
  '@peac/policy-kit',
  '@peac/rails-stripe',
  '@peac/rails-x402',
  '@peac/rails-card',
  '@peac/mappings-acp',
  '@peac/mappings-mcp',
  '@peac/mappings-rsl',
  '@peac/mappings-tap',
  // L4: Adapters (depend on schema)
  '@peac/adapter-x402-daydreams',
  '@peac/adapter-x402-fluora',
  '@peac/adapter-x402-pinata',
  // L5: Applications
  '@peac/cli',
  '@peac/server',
  '@peac/receipts',
  '@peac/pref',
  '@peac/disc',
  '@peac/pay402',
  // L6: SDK
  '@peac/core',
  '@peac/sdk',
];

/**
 * Find all workspace packages
 */
function findWorkspacePackages() {
  const output = execSync('pnpm -r list --json --depth -1', {
    cwd: ROOT,
    encoding: 'utf-8',
  });

  const packages = JSON.parse(output);
  return packages
    .filter((pkg) => pkg.name && pkg.name.startsWith('@peac/'))
    .map((pkg) => ({
      name: pkg.name,
      path: pkg.path,
      version: pkg.version,
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
 * Publish a single package
 */
function publishPackage(name, dryRun) {
  const cmd = `pnpm --filter "${name}" publish --access public --tag ${TAG} --no-git-checks`;

  console.log(`\n  ${dryRun ? '[DRY-RUN]' : '[PUBLISH]'} ${name}`);
  console.log(`  > ${cmd}`);

  if (dryRun) {
    return { success: true, output: '(dry-run)' };
  }

  try {
    const output = execSync(cmd, { cwd: ROOT, encoding: 'utf-8', stdio: 'pipe' });
    return { success: true, output };
  } catch (err) {
    return { success: false, output: err.message };
  }
}

/**
 * Main
 */
function main() {
  console.log('PEAC Protocol - Safe Publish Script');
  console.log('====================================');
  console.log(`Mode: ${DRY_RUN ? 'DRY-RUN' : 'LIVE'}`);
  console.log(`Tag: ${TAG}`);
  console.log('');

  // Find packages
  const allPackages = findWorkspacePackages();
  const publicPackages = allPackages.filter((pkg) => isPublic(pkg.path));
  const privatePackages = allPackages.filter((pkg) => !isPublic(pkg.path));

  console.log(`Found ${allPackages.length} workspace packages:`);
  console.log(`  - ${publicPackages.length} public (will publish)`);
  console.log(`  - ${privatePackages.length} private (will skip)`);
  console.log('');

  // Show private packages (skipped)
  console.log('Private packages (skipped):');
  for (const pkg of privatePackages) {
    console.log(`  - ${pkg.name}`);
  }
  console.log('');

  // Sort public packages by layer order
  const publicNames = new Set(publicPackages.map((p) => p.name));
  const sortedPublic = LAYER_ORDER.filter((name) => publicNames.has(name));

  // Check for unlisted public packages
  const unlisted = publicPackages.filter((p) => !LAYER_ORDER.includes(p.name));
  if (unlisted.length > 0) {
    console.log('WARNING: Found public packages not in LAYER_ORDER:');
    for (const pkg of unlisted) {
      console.log(`  - ${pkg.name} (will publish last)`);
    }
    sortedPublic.push(...unlisted.map((p) => p.name));
    console.log('');
  }

  // Publish in order
  console.log(`Publishing ${sortedPublic.length} packages in topological order:`);
  console.log('');

  const results = [];
  for (const name of sortedPublic) {
    const result = publishPackage(name, DRY_RUN);
    results.push({ name, ...result });
  }

  // Summary
  console.log('\n====================================');
  console.log('PUBLISH SUMMARY');
  console.log('====================================');

  const succeeded = results.filter((r) => r.success);
  const failed = results.filter((r) => !r.success);

  console.log(`Succeeded: ${succeeded.length}`);
  console.log(`Failed: ${failed.length}`);

  if (failed.length > 0) {
    console.log('\nFailed packages:');
    for (const f of failed) {
      console.log(`  - ${f.name}: ${f.output}`);
    }
    process.exit(1);
  }

  console.log('\nAll packages published successfully!');

  // Verification hint
  if (!DRY_RUN) {
    console.log('\nVerify with:');
    console.log('  npm view @peac/protocol@next dependencies');
    console.log('  npm view @peac/crypto@next dist-tags');
  }
}

main();
