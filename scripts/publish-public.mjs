#!/usr/bin/env node
/**
 * Safe publish script for PEAC Protocol
 *
 * - Loads package list from publish-manifest.json (single source of truth)
 * - Filters to public packages only (private !== true)
 * - Publishes in topological order (dependencies first)
 * - Supports idempotent publishing (--skip-existing)
 * - Supports real dry-run (--dry-run runs pnpm publish --dry-run)
 * - Supports provenance attestation (--provenance)
 * - Supports subset publishing (--only, --limit) for OIDC rollout
 * - Fail-fast on errors to prevent publishing dependent packages
 *
 * Usage:
 *   node scripts/publish-public.mjs [options]
 *
 * Options:
 *   --dry-run       Run pnpm publish --dry-run to validate packaging (no upload)
 *   --tag=TAG       npm dist-tag (default: next)
 *   --skip-existing Skip packages already published at this version (idempotent)
 *   --provenance    Enable npm provenance attestation (requires OIDC)
 *   --strict        Fail if manifest missing, invalid, version mismatch, or deps not included
 *   --only=PKG,...  Only publish specified packages (comma-separated)
 *   --limit=N       Only publish first N packages from manifest (for rollout)
 *
 * Examples:
 *   node scripts/publish-public.mjs --dry-run
 *   node scripts/publish-public.mjs --dry-run --strict
 *   node scripts/publish-public.mjs --tag=next --skip-existing --provenance
 *   node scripts/publish-public.mjs --only=@peac/kernel,@peac/schema,@peac/crypto --provenance
 *   node scripts/publish-public.mjs --limit=4 --provenance
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const MANIFEST_PATH = join(__dirname, 'publish-manifest.json');

// Parse args
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const SKIP_EXISTING = args.includes('--skip-existing');
const PROVENANCE = args.includes('--provenance');
const STRICT = args.includes('--strict');
const TAG = args.find((a) => a.startsWith('--tag='))?.split('=')[1] || 'next';
const ONLY = args.find((a) => a.startsWith('--only='))?.split('=')[1]?.split(',') || [];
const LIMIT = parseInt(args.find((a) => a.startsWith('--limit='))?.split('=')[1] || '0', 10);

/**
 * Get root package.json version
 */
function getRootVersion() {
  const rootPkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf-8'));
  return rootPkg.version;
}

/**
 * Load package list from manifest (single source of truth)
 * In strict mode, fails if manifest is missing, invalid, or version mismatch
 */
function loadPackageOrder() {
  const rootVersion = getRootVersion();

  if (!existsSync(MANIFEST_PATH)) {
    if (STRICT) {
      console.error('ERROR: scripts/publish-manifest.json not found (--strict mode)');
      console.error('The manifest is required as the single source of truth for publishing.');
      process.exit(1);
    }
    console.log('WARNING: publish-manifest.json not found, using hardcoded list');
    return { packages: FALLBACK_LAYER_ORDER, version: null };
  }

  try {
    const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf-8'));

    if (!manifest.packages || !Array.isArray(manifest.packages)) {
      if (STRICT) {
        console.error('ERROR: scripts/publish-manifest.json is invalid (missing packages array)');
        process.exit(1);
      }
      console.log('WARNING: publish-manifest.json invalid, using hardcoded list');
      return { packages: FALLBACK_LAYER_ORDER, version: null };
    }

    // Strict mode: require manifest.version and check it matches root
    if (STRICT) {
      if (!manifest.version) {
        console.error('ERROR: scripts/publish-manifest.json missing "version" field (--strict mode)');
        process.exit(1);
      }
      if (manifest.version !== rootVersion) {
        console.error(`ERROR: Manifest version (${manifest.version}) does not match root package.json (${rootVersion})`);
        console.error('Update scripts/publish-manifest.json version field to match.');
        process.exit(1);
      }
    }

    console.log(`Loaded ${manifest.packages.length} packages from publish-manifest.json`);
    if (manifest.version) {
      console.log(`Manifest version: ${manifest.version}`);
    }
    return { packages: manifest.packages, version: manifest.version || null };
  } catch (err) {
    if (STRICT) {
      console.error('ERROR: Failed to parse scripts/publish-manifest.json');
      console.error(err.message);
      process.exit(1);
    }
    console.log('WARNING: Failed to parse manifest, using hardcoded list');
    return { packages: FALLBACK_LAYER_ORDER, version: null };
  }
}

/**
 * Fallback topological publish order (dependencies first)
 * Used only if publish-manifest.json doesn't exist and not in strict mode
 */
const FALLBACK_LAYER_ORDER = [
  '@peac/kernel',
  '@peac/schema',
  '@peac/crypto',
  '@peac/protocol',
  '@peac/control',
  '@peac/contracts',
  '@peac/http-signatures',
  '@peac/jwks-cache',
  '@peac/policy-kit',
  '@peac/telemetry',
  '@peac/telemetry-otel',
  '@peac/worker-core',
  '@peac/net-node',
  '@peac/attribution',
  '@peac/adapter-core',
  '@peac/rails-stripe',
  '@peac/rails-x402',
  '@peac/rails-card',
  '@peac/mappings-acp',
  '@peac/mappings-aipref',
  '@peac/mappings-mcp',
  '@peac/mappings-rsl',
  '@peac/mappings-tap',
  '@peac/mappings-ucp',
  '@peac/adapter-x402',
  '@peac/adapter-x402-daydreams',
  '@peac/adapter-x402-fluora',
  '@peac/adapter-x402-pinata',
  '@peac/cli',
  '@peac/server',
  '@peac/receipts',
  '@peac/pref',
  '@peac/disc',
  '@peac/pay402',
  '@peac/core',
  '@peac/sdk',
];

/**
 * Find all workspace packages using execFileSync (safer than shell string)
 */
function findWorkspacePackages() {
  const output = execFileSync('pnpm', ['-r', 'list', '--json', '--depth', '-1'], {
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
 * Get package version from package.json
 */
function getPackageVersion(pkgPath) {
  const pkgJson = join(pkgPath, 'package.json');
  const pkg = JSON.parse(readFileSync(pkgJson, 'utf-8'));
  return pkg.version;
}

/**
 * Get package dependencies (workspace @peac/* deps only)
 */
function getPackageDeps(pkgPath) {
  const pkgJson = join(pkgPath, 'package.json');
  const pkg = JSON.parse(readFileSync(pkgJson, 'utf-8'));
  const deps = { ...pkg.dependencies, ...pkg.peerDependencies };
  return Object.keys(deps).filter((d) => d.startsWith('@peac/'));
}

/**
 * Check if package@version already exists on npm
 */
function isPublishedOnNpm(name, version) {
  try {
    execFileSync('npm', ['view', `${name}@${version}`, 'version'], {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Publish a single package using execFileSync (safer than shell string)
 */
function publishPackage(name, version, options) {
  const { dryRun, skipExisting, provenance } = options;

  // Check if already published (idempotent mode)
  if (skipExisting && !dryRun) {
    if (isPublishedOnNpm(name, version)) {
      console.log(`\n  [SKIP] ${name}@${version} (already published)`);
      return { success: true, output: '(skipped - already exists)', skipped: true };
    }
  }

  // Build publish command args (no shell string joining)
  const pnpmArgs = [
    '--filter', name,
    'publish',
    '--access', 'public',
    '--tag', TAG,
    '--no-git-checks',
  ];

  // Add --dry-run flag for real dry-run validation
  if (dryRun) {
    pnpmArgs.push('--dry-run');
  }

  // Add --provenance for supply chain attestation
  // Note: With Trusted Publishing, provenance is generated automatically,
  // but explicit flag ensures it even in edge cases
  if (provenance && !dryRun) {
    pnpmArgs.push('--provenance');
  }

  const cmdDisplay = `pnpm ${pnpmArgs.join(' ')}`;
  console.log(`\n  ${dryRun ? '[DRY-RUN]' : '[PUBLISH]'} ${name}@${version}`);
  console.log(`  > ${cmdDisplay}`);

  try {
    const output = execFileSync('pnpm', pnpmArgs, {
      cwd: ROOT,
      encoding: 'utf-8',
      stdio: 'pipe',
    });
    return { success: true, output, skipped: false };
  } catch (err) {
    // Include stdout/stderr for better debugging
    const stdout = err.stdout || '';
    const stderr = err.stderr || '';
    const fullOutput = [
      err.message,
      stdout ? `\n--- stdout ---\n${stdout}` : '',
      stderr ? `\n--- stderr ---\n${stderr}` : '',
    ].join('');
    return { success: false, output: fullOutput, skipped: false };
  }
}

/**
 * Check dependency closure for --only packages in strict mode
 */
function checkDependencyClosure(selectedPackages, packageMap) {
  const selectedSet = new Set(selectedPackages);
  const missingDeps = [];

  for (const name of selectedPackages) {
    const pkg = packageMap.get(name);
    if (!pkg) continue;

    const deps = getPackageDeps(pkg.path);
    for (const dep of deps) {
      // Only check deps that are in our manifest (public @peac packages)
      if (packageMap.has(dep) && !selectedSet.has(dep)) {
        missingDeps.push({ package: name, missingDep: dep });
      }
    }
  }

  return missingDeps;
}

/**
 * Main
 */
function main() {
  console.log('PEAC Protocol - Safe Publish Script');
  console.log('====================================');
  console.log(`Mode: ${DRY_RUN ? 'DRY-RUN (validates packaging)' : 'LIVE (uploads to npm)'}`);
  console.log(`Tag: ${TAG}`);
  console.log(`Skip existing: ${SKIP_EXISTING}`);
  console.log(`Provenance: ${PROVENANCE}`);
  console.log(`Strict mode: ${STRICT}`);
  if (ONLY.length > 0) {
    console.log(`Only packages: ${ONLY.join(', ')}`);
  }
  if (LIMIT > 0) {
    console.log(`Limit: first ${LIMIT} packages`);
  }
  console.log('');

  // Load package order from manifest
  const { packages: LAYER_ORDER } = loadPackageOrder();

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

  // Build lookup map
  const packageMap = new Map(publicPackages.map((p) => [p.name, p]));

  // Sort public packages by layer order
  let sortedPublic = [];
  for (const name of LAYER_ORDER) {
    if (packageMap.has(name)) {
      sortedPublic.push(name);
    }
  }

  // Check for unlisted public packages (not in LAYER_ORDER)
  const unlisted = publicPackages.filter((p) => !LAYER_ORDER.includes(p.name));
  if (unlisted.length > 0) {
    if (STRICT) {
      console.log('ERROR: Found public packages not in manifest (--strict mode):');
      for (const pkg of unlisted) {
        console.log(`  - ${pkg.name}`);
      }
      console.log('');
      console.log('Add these packages to scripts/publish-manifest.json');
      process.exit(1);
    } else {
      // Without --strict, we only publish packages IN the manifest
      // This allows incremental OIDC rollout (only configured packages are published)
      console.log('NOTE: Found public packages not in manifest (will NOT publish):');
      for (const pkg of unlisted) {
        console.log(`  - ${pkg.name}`);
      }
      console.log('');
      console.log('To publish these packages, add them to scripts/publish-manifest.json');
      console.log('after configuring npm Trusted Publishing for each one.');
      console.log('');
    }
  }

  // Check for packages in LAYER_ORDER that don't exist
  const missing = LAYER_ORDER.filter((name) => !packageMap.has(name));
  if (missing.length > 0) {
    if (STRICT) {
      console.log('ERROR: Packages in manifest but not found (--strict mode):');
      for (const name of missing) {
        console.log(`  - ${name}`);
      }
      console.log('');
      console.log('Remove these packages from scripts/publish-manifest.json or ensure they exist');
      process.exit(1);
    } else {
      console.log('NOTE: Packages in manifest but not found (may be private or removed):');
      for (const name of missing) {
        console.log(`  - ${name}`);
      }
      console.log('');
    }
  }

  // Apply --only filter
  if (ONLY.length > 0) {
    const onlySet = new Set(ONLY);
    const invalidOnly = ONLY.filter((name) => !packageMap.has(name));
    if (invalidOnly.length > 0) {
      console.log('ERROR: --only contains packages not found:');
      for (const name of invalidOnly) {
        console.log(`  - ${name}`);
      }
      process.exit(1);
    }
    sortedPublic = sortedPublic.filter((name) => onlySet.has(name));
    console.log(`Filtered to ${sortedPublic.length} packages via --only`);

    // Strict mode: check dependency closure
    if (STRICT) {
      const missingDeps = checkDependencyClosure(sortedPublic, packageMap);
      if (missingDeps.length > 0) {
        console.log('');
        console.log('ERROR: --only packages have dependencies not included (--strict mode):');
        for (const { package: pkg, missingDep } of missingDeps) {
          console.log(`  - ${pkg} requires ${missingDep}`);
        }
        console.log('');
        console.log('Either add missing deps to --only or use --limit for cleaner subsets.');
        process.exit(1);
      }
    }
    console.log('');
  }

  // Apply --limit
  if (LIMIT > 0 && LIMIT < sortedPublic.length) {
    sortedPublic = sortedPublic.slice(0, LIMIT);
    console.log(`Limited to first ${LIMIT} packages via --limit`);
    console.log('');
  }

  // Publish in order
  console.log(`Publishing ${sortedPublic.length} packages in topological order:`);
  console.log('');

  const results = [];
  let failFast = false;

  for (const name of sortedPublic) {
    if (failFast) {
      // Mark fail-fast skipped packages as success=true, skipped=true
      // This prevents double-counting as both skipped AND failed
      results.push({
        name,
        success: true,
        output: '(skipped due to earlier failure)',
        skipped: true,
        failFastSkip: true,
      });
      continue;
    }

    const pkg = packageMap.get(name);
    const version = getPackageVersion(pkg.path);
    const result = publishPackage(name, version, {
      dryRun: DRY_RUN,
      skipExisting: SKIP_EXISTING,
      provenance: PROVENANCE,
    });
    results.push({ name, version, ...result });

    // Fail fast on error (don't continue with dependent packages)
    if (!result.success) {
      console.log('\n  ERROR: Stopping publish due to failure (fail-fast)');
      failFast = true;
    }
  }

  // Summary
  console.log('\n====================================');
  console.log('PUBLISH SUMMARY');
  console.log('====================================');

  const succeeded = results.filter((r) => r.success && !r.skipped);
  const skippedExisting = results.filter((r) => r.skipped && !r.failFastSkip);
  const skippedFailFast = results.filter((r) => r.failFastSkip);
  const failed = results.filter((r) => !r.success);

  if (DRY_RUN) {
    console.log(`Validated: ${succeeded.length}`);
  } else {
    console.log(`Published: ${succeeded.length}`);
  }
  console.log(`Skipped (already exists): ${skippedExisting.length}`);
  if (skippedFailFast.length > 0) {
    console.log(`Skipped (fail-fast): ${skippedFailFast.length}`);
  }
  console.log(`Failed: ${failed.length}`);

  if (failed.length > 0) {
    console.log('\nFailed packages:');
    for (const f of failed) {
      console.log(`  - ${f.name}:`);
      // Indent the output for readability
      const lines = f.output.split('\n');
      for (const line of lines.slice(0, 20)) {
        console.log(`      ${line}`);
      }
      if (lines.length > 20) {
        console.log(`      ... (${lines.length - 20} more lines)`);
      }
    }
    process.exit(1);
  }

  // No-op guard: if all packages were skipped (already exist), warn or error
  // This prevents silently thinking a release happened when nothing changed
  if (!DRY_RUN && succeeded.length === 0 && skippedExisting.length > 0) {
    console.log('\nWARNING: All packages were already published (nothing new)');
    if (STRICT) {
      console.log('ERROR: --strict mode requires at least one new package to publish');
      console.log('       This prevents accidentally believing a release happened.');
      console.log('');
      console.log('If this is intentional (re-running after partial failure):');
      console.log('  - Remove --strict flag, or');
      console.log('  - Bump versions before re-running');
      process.exit(1);
    }
  }

  if (DRY_RUN) {
    console.log('\nAll packages validated successfully!');
    console.log('Ready for production publish.');
  } else {
    console.log('\nAll packages published successfully!');

    // Verification hints
    if (succeeded.length > 0) {
      console.log('\nVerify published packages:');
      console.log(`  npm view @peac/kernel@${TAG} version`);
      console.log(`  npm view @peac/protocol@${TAG} dependencies`);
      console.log('');
      console.log('Verify provenance (in a test project with these packages installed):');
      console.log('  npm audit signatures');
    }
  }
}

main();
