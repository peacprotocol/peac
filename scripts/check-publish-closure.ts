/**
 * Publish-Manifest Closure Check
 *
 * Verifies that all runtime @peac/* dependencies of manifest packages
 * are also in the manifest. Prevents publishing packages with broken
 * dependency chains.
 *
 * Run: npx tsx scripts/check-publish-closure.ts
 *
 * Exits 0 if closure is satisfied, 1 if not.
 */

import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..');
const MANIFEST_PATH = path.join(ROOT, 'scripts/publish-manifest.json');

interface PublishManifest {
  packages: string[];
}

/**
 * Map npm package name to directory path.
 * Handles both flat (packages/kernel) and nested (packages/adapters/openclaw) layouts.
 */
function packageDir(npmName: string): string {
  // Strip @peac/ prefix
  const shortName = npmName.replace('@peac/', '');

  // Check flat layout first: packages/<shortName>
  const flatDir = path.join(ROOT, 'packages', shortName);
  if (fs.existsSync(path.join(flatDir, 'package.json'))) {
    return flatDir;
  }

  // Check nested layouts
  const nestedMappings: Record<string, string> = {
    'adapter-core': 'packages/adapters/core',
    'adapter-openclaw': 'packages/adapters/openclaw',
    'adapter-x402': 'packages/adapters/x402',
    'adapter-x402-daydreams': 'packages/adapters/x402-daydreams',
    'adapter-x402-fluora': 'packages/adapters/x402-fluora',
    'adapter-x402-pinata': 'packages/adapters/x402-pinata',
    'rails-x402': 'packages/rails/x402',
    'rails-stripe': 'packages/rails/stripe',
    'rails-card': 'packages/rails/card',
    'rails-razorpay': 'packages/rails/razorpay',
    'mappings-mcp': 'packages/mappings/mcp',
    'mappings-acp': 'packages/mappings/acp',
    'mappings-aipref': 'packages/mappings/aipref',
    'mappings-rsl': 'packages/mappings/rsl',
    'mappings-tap': 'packages/mappings/tap',
    'mappings-ucp': 'packages/mappings/ucp',
    'capture-core': 'packages/capture/core',
    'sdk-js': 'packages/sdk-js',
    'net-node': 'packages/net/node',
    disc: 'packages/discovery',
  };

  if (nestedMappings[shortName]) {
    return path.join(ROOT, nestedMappings[shortName]);
  }

  // Fallback: try the flat name
  return flatDir;
}

function main() {
  console.log('Reading publish manifest...');
  const manifest: PublishManifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf-8'));
  const manifestSet = new Set(manifest.packages);

  console.log(`Manifest contains ${manifest.packages.length} packages`);

  const errors: string[] = [];
  const warnings: string[] = [];

  for (const pkgName of manifest.packages) {
    const dir = packageDir(pkgName);
    const pkgJsonPath = path.join(dir, 'package.json');

    if (!fs.existsSync(pkgJsonPath)) {
      errors.push(`${pkgName}: package.json not found at ${dir}`);
      continue;
    }

    const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8'));

    // Verify files field exists and is restrictive (prevents tarball artifact leaks)
    if (!Array.isArray(pkgJson.files)) {
      errors.push(`${pkgName}: missing "files" field -- tarballs will include build artifacts`);
    } else if (pkgJson.files.some((f: string) => f === '.' || f === '**/*' || f === '*')) {
      errors.push(`${pkgName}: overly broad "files" field -- use ["dist", "README.md"] pattern`);
    } else if (!pkgJson.files.includes('dist')) {
      warnings.push(`${pkgName}: "files" field does not include "dist"`);
    }

    const deps = pkgJson.dependencies || {};

    for (const [depName, depVersion] of Object.entries(deps)) {
      // Check for unresolved workspace:* (would break in tarball)
      if (String(depVersion) === 'workspace:*') {
        // This is fine in source -- pnpm pack resolves it.
        // But we verify the dep itself is in the manifest if it's @peac/*
      }

      // Check if @peac/* dep is in the manifest
      if (depName.startsWith('@peac/') && !manifestSet.has(depName)) {
        errors.push(
          `${pkgName} depends on ${depName} (${depVersion}) which is NOT in publish manifest`
        );
      }
    }
  }

  // Report
  if (warnings.length > 0) {
    console.log('\nWarnings:');
    for (const w of warnings) {
      console.log(`  WARN: ${w}`);
    }
  }

  if (errors.length > 0) {
    console.log('\nClosure violations:');
    for (const e of errors) {
      console.log(`  FAIL: ${e}`);
    }
    console.log(`\n${errors.length} closure violation(s) found.`);
    console.log('Fix: Add missing packages to scripts/publish-manifest.json');
    console.log('     OR refactor the dependency to use an already-published package.');
    process.exit(1);
  }

  console.log('\nPublish manifest closure check PASSED');
  console.log(`All ${manifest.packages.length} packages have their @peac/* deps in the manifest.`);
}

main();
