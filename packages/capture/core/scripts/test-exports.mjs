#!/usr/bin/env node
/**
 * Node Exports Smoke Test (Package Consumer Test)
 *
 * This test verifies that package.json#exports works correctly by:
 * 1. Creating a tarball with `pnpm pack --pack-destination <tempDir>`
 * 2. Installing it in a temp fixture directory
 * 3. Testing that require.resolve() resolves via the exports map
 *
 * Run after build:
 *   pnpm build --filter @peac/capture-core
 *   node packages/capture/core/scripts/test-exports.mjs
 *
 * This catches "tests pass but consumers can't import subpath" regressions.
 *
 * NOTE: We test resolution (require.resolve) rather than loading (require)
 * because the package has workspace dependencies that aren't installed in
 * the fixture. The exports map is the thing we're validating.
 *
 * SAFETY: This script never creates artifacts in the repo directory.
 * All tarballs are created directly in a temp directory.
 */

import { execSync } from 'child_process';
import { mkdtempSync, rmSync, writeFileSync, existsSync, readdirSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(__dirname, '..');

// =============================================================================
// Configuration
// =============================================================================

const PACKAGE_NAME = '@peac/capture-core';
const EXPECTED_MAIN_EXPORTS = [
  'GENESIS_DIGEST',
  'SIZE_CONSTANTS',
  'createHasher',
  'createCaptureSession',
  'toInteractionEvidence',
  'toInteractionEvidenceBatch',
];
const EXPECTED_TESTKIT_EXPORTS = [
  'InMemorySpoolStore',
  'InMemoryDedupeIndex',
  'createInMemorySpoolStore',
  'createInMemoryDedupeIndex',
];

// Canonical internal paths that consumers might try to import
// These should be blocked by the exports map
const FORBIDDEN_INTERNAL_PATHS = [
  'dist/types',
  'dist/session',
  'dist/hasher',
  'dist/mapper',
  'dist/testkit-impl',
  'src/index',
  'package.json', // Should be blocked by exports (modern Node behavior)
];

// =============================================================================
// Helpers
// =============================================================================

function log(msg) {
  console.log(`  ${msg}`);
}

function logSection(msg) {
  console.log(`\n${msg}`);
}

function execInDir(cmd, cwd) {
  return execSync(cmd, { cwd, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
}

// =============================================================================
// Main Test
// =============================================================================

async function main() {
  console.log('Node Exports Smoke Test (Package Consumer)');
  console.log('==========================================');

  let fixture = null;
  let allPassed = true;

  try {
    // -------------------------------------------------------------------------
    // Step 1: Create fixture directory first (tarball goes here directly)
    // -------------------------------------------------------------------------
    logSection('Step 1: Creating fixture directory...');
    fixture = mkdtempSync(join(tmpdir(), 'peac-exports-test-'));
    log(`Fixture: ${fixture}`);

    // Create package.json for the fixture
    writeFileSync(
      join(fixture, 'package.json'),
      JSON.stringify(
        {
          name: 'exports-test-fixture',
          version: '1.0.0',
          private: true,
        },
        null,
        2
      )
    );

    // -------------------------------------------------------------------------
    // Step 2: Create tarball directly in fixture (no repo root artifacts)
    // -------------------------------------------------------------------------
    logSection('Step 2: Creating tarball with pnpm pack...');

    // Pack directly into fixture directory - never touches repo root
    const packOutput = execInDir(`pnpm pack --pack-destination "${fixture}"`, packageRoot);
    log(`Pack output: ${packOutput.trim()}`);

    // Find the created tarball in fixture
    const tarballs = readdirSync(fixture).filter((f) => f.endsWith('.tgz'));
    if (tarballs.length !== 1) {
      throw new Error(`Expected exactly 1 tarball in fixture, found: ${tarballs.join(', ') || 'none'}`);
    }
    const tarballName = tarballs[0];
    const tarballPath = join(fixture, tarballName);
    log(`Created: ${tarballName}`);

    // -------------------------------------------------------------------------
    // Step 3: Install tarball in fixture
    // -------------------------------------------------------------------------
    logSection('Step 3: Installing tarball...');
    // Use npm (not pnpm) to avoid workspace protocol issues
    // Flags for CI determinism: no audit, no fund, quiet output, ignore scripts
    execInDir(
      `npm install "${tarballPath}" --ignore-scripts --no-audit --no-fund --loglevel=error`,
      fixture
    );
    log('Installed successfully');

    // Verify the package exists
    const installedPath = join(fixture, 'node_modules', '@peac', 'capture-core');
    if (!existsSync(installedPath)) {
      throw new Error(`Package not installed at expected path: ${installedPath}`);
    }

    // -------------------------------------------------------------------------
    // Step 4: Test exports resolution
    // -------------------------------------------------------------------------
    logSection('Step 4: Testing exports resolution...');

    // Create a require function rooted in the fixture
    const fixtureRequire = createRequire(join(fixture, 'index.js'));

    // Test main entry point resolution
    try {
      const mainResolved = fixtureRequire.resolve(PACKAGE_NAME);
      log(`PASS: ${PACKAGE_NAME} resolves to:`);
      log(`      ${mainResolved}`);

      // Verify it resolves to the right file
      if (!mainResolved.endsWith('dist/index.js')) {
        console.error(`FAIL: Expected to resolve to dist/index.js, got: ${mainResolved}`);
        allPassed = false;
      }
    } catch (err) {
      console.error(`FAIL: ${PACKAGE_NAME} resolution failed: ${err.message}`);
      allPassed = false;
    }

    // Test testkit subpath resolution
    try {
      const testkitResolved = fixtureRequire.resolve(`${PACKAGE_NAME}/testkit`);
      log(`PASS: ${PACKAGE_NAME}/testkit resolves to:`);
      log(`      ${testkitResolved}`);

      // Verify it resolves to the right file
      if (!testkitResolved.endsWith('dist/testkit.js')) {
        console.error(`FAIL: Expected to resolve to dist/testkit.js, got: ${testkitResolved}`);
        allPassed = false;
      }
    } catch (err) {
      console.error(`FAIL: ${PACKAGE_NAME}/testkit resolution failed: ${err.message}`);
      allPassed = false;
    }

    // Test that internal paths are NOT exposed (canonical specifiers)
    for (const internalPath of FORBIDDEN_INTERNAL_PATHS) {
      const specifier = `${PACKAGE_NAME}/${internalPath}`;
      try {
        fixtureRequire.resolve(specifier);
        console.error(`FAIL: Internal path ${specifier} should NOT be resolvable`);
        allPassed = false;
      } catch {
        log(`PASS: ${specifier} correctly blocked`);
      }
    }

    // -------------------------------------------------------------------------
    // Step 5: Test actual loading (exports exist)
    // -------------------------------------------------------------------------
    logSection('Step 5: Testing exports presence (via direct file require)...');

    // Since we can't load via specifier (missing deps), load the dist files directly
    // to verify the exports are present. This is a secondary check.
    const distPath = join(installedPath, 'dist');

    try {
      const mainModule = fixtureRequire(join(distPath, 'index.js'));
      const missing = EXPECTED_MAIN_EXPORTS.filter((exp) => !(exp in mainModule));
      if (missing.length > 0) {
        console.error(`FAIL: Main entry missing exports: ${missing.join(', ')}`);
        allPassed = false;
      } else {
        log(`PASS: Main entry has all expected exports`);
      }

      // Verify testkit exports are NOT in main
      const leaked = EXPECTED_TESTKIT_EXPORTS.filter((exp) => exp in mainModule);
      if (leaked.length > 0) {
        console.error(`FAIL: Main entry has leaked testkit exports: ${leaked.join(', ')}`);
        allPassed = false;
      } else {
        log(`PASS: Main entry correctly excludes testkit exports`);
      }
    } catch (err) {
      // This might fail due to missing @peac/crypto dep, which is expected
      if (err.code === 'MODULE_NOT_FOUND' && err.message.includes('@peac/')) {
        log(`SKIP: Cannot load main module (missing workspace deps) - this is expected`);
      } else {
        console.error(`FAIL: Unexpected error loading main: ${err.message}`);
        allPassed = false;
      }
    }

    try {
      const testkitModule = fixtureRequire(join(distPath, 'testkit.js'));
      const missing = EXPECTED_TESTKIT_EXPORTS.filter((exp) => !(exp in testkitModule));
      if (missing.length > 0) {
        console.error(`FAIL: Testkit entry missing exports: ${missing.join(', ')}`);
        allPassed = false;
      } else {
        log(`PASS: Testkit entry has all expected exports`);
      }
    } catch (err) {
      // Testkit should have fewer deps, but might still fail
      if (err.code === 'MODULE_NOT_FOUND' && err.message.includes('@peac/')) {
        log(`SKIP: Cannot load testkit module (missing workspace deps) - this is expected`);
      } else {
        console.error(`FAIL: Unexpected error loading testkit: ${err.message}`);
        allPassed = false;
      }
    }
  } catch (err) {
    console.error(`\nFATAL: ${err.message}`);
    allPassed = false;
  } finally {
    // -------------------------------------------------------------------------
    // Cleanup (only the fixture directory - we never touched repo root)
    // -------------------------------------------------------------------------
    if (fixture) {
      logSection('Cleanup...');
      try {
        rmSync(fixture, { recursive: true });
        log('Removed fixture directory (including tarball)');
      } catch {
        log(`Warning: Could not remove fixture: ${fixture}`);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Summary
  // ---------------------------------------------------------------------------
  console.log('\n-------------------------------------------');
  if (allPassed) {
    console.log('All exports tests PASSED');
    process.exit(0);
  } else {
    console.log('Some exports tests FAILED');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Unhandled error:', err);
  process.exit(1);
});
