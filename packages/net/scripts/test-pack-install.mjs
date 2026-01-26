#!/usr/bin/env node
/**
 * Real tarball install test for @peac/net-node
 *
 * This script validates that the published package:
 * 1. Contains all required files (dist/internal.*)
 * 2. Main entry (@peac/net-node) does NOT export _internals
 * 3. Testing entry (@peac/net-node/testing) DOES export _internals.finalizeEvidence
 *
 * This catches packaging mistakes that local tests miss.
 *
 * The test packs both @peac/net-node AND its workspace dependencies (@peac/schema)
 * to ensure we're testing the actual packages being shipped, not npm versions.
 *
 * Usage: node scripts/test-pack-install.mjs
 */

import { execSync } from 'child_process';
import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageDir = join(__dirname, '..');
const repoRoot = join(packageDir, '..', '..');

// ANSI colors for output
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RESET = '\x1b[0m';

function log(msg) {
  console.log(msg);
}

function pass(msg) {
  console.log(`${GREEN}PASS${RESET}: ${msg}`);
}

function fail(msg) {
  console.error(`${RED}FAIL${RESET}: ${msg}`);
  process.exit(1);
}

function warn(msg) {
  console.log(`${YELLOW}WARN${RESET}: ${msg}`);
}

/**
 * Pack a package and return the path to the tarball
 */
function packPackage(pkgDir, destDir) {
  // Build first
  execSync('pnpm build', { cwd: pkgDir, stdio: 'inherit' });

  // Pack to destination
  const output = execSync(`pnpm pack --pack-destination "${destDir}"`, {
    cwd: pkgDir,
    encoding: 'utf8',
  });

  return output.trim().split('\n').pop();
}

// -----------------------------------------------------------------------------
// Main Test
// -----------------------------------------------------------------------------

const tempPackDir = mkdtempSync(join(tmpdir(), 'peac-net-pack-'));
let testProjectDir = null;

try {
  // -----------------------------------------------------------------------------
  // Step 1: Pack workspace dependencies first
  // -----------------------------------------------------------------------------

  log('\n--- Step 1: Packing workspace dependencies ---\n');
  log(`Pack destination: ${tempPackDir}`);

  // Pack @peac/schema (dependency of @peac/net-node)
  const schemaDir = join(repoRoot, 'packages', 'schema');
  const schemaTgz = packPackage(schemaDir, tempPackDir);
  pass(`Packed @peac/schema to ${schemaTgz}`);

  // -----------------------------------------------------------------------------
  // Step 2: Pack @peac/net-node
  // -----------------------------------------------------------------------------

  log('\n--- Step 2: Packing @peac/net-node ---\n');

  const netTgz = packPackage(packageDir, tempPackDir);
  pass(`Packed @peac/net-node to ${netTgz}`);

  // -----------------------------------------------------------------------------
  // Step 3: Verify tarball contents
  // -----------------------------------------------------------------------------

  log('\n--- Step 3: Verifying tarball contents ---\n');

  const tarList = execSync(`tar -tzf "${netTgz}"`, { encoding: 'utf8' });
  const files = tarList.split('\n').filter(Boolean);

  const requiredFiles = [
    'package/dist/index.js',
    'package/dist/index.d.ts',
    'package/dist/testing.js',
    'package/dist/testing.d.ts',
    'package/dist/internal.js',
    'package/dist/internal.d.ts',
    'package/package.json',
  ];

  for (const required of requiredFiles) {
    if (files.includes(required)) {
      pass(`Contains ${required}`);
    } else {
      fail(`Missing ${required} in tarball`);
    }
  }

  // -----------------------------------------------------------------------------
  // Step 4: Install in fresh project
  // -----------------------------------------------------------------------------

  log('\n--- Step 4: Installing in fresh project ---\n');

  testProjectDir = mkdtempSync(join(tmpdir(), 'peac-net-test-'));
  log(`Test project: ${testProjectDir}`);

  // Initialize project
  writeFileSync(
    join(testProjectDir, 'package.json'),
    JSON.stringify(
      {
        name: 'test-peac-net-install',
        type: 'module',
        private: true,
      },
      null,
      2
    )
  );

  // Create empty .npmrc to isolate from user's config
  // This prevents "Unknown env config" warnings from user's global .npmrc
  const hermeticNpmrc = join(testProjectDir, '.npmrc');
  writeFileSync(hermeticNpmrc, '# Hermetic test config\n');

  // Environment for npm commands - isolate from pnpm/user config
  // Remove pnpm-specific env vars that npm doesn't understand
  const npmEnv = { ...process.env };
  npmEnv.NPM_CONFIG_USERCONFIG = hermeticNpmrc;
  // Clear pnpm-specific settings that leak through as npm_config_* env vars
  delete npmEnv.npm_config_recursive;
  delete npmEnv.npm_config_publish_branch;

  // Install dependencies in order: schema first, then net-node
  // npm will resolve @peac/schema from the already-installed tarball
  execSync(`npm install "${schemaTgz}"`, {
    cwd: testProjectDir,
    stdio: 'inherit',
    env: npmEnv,
  });
  pass('Installed @peac/schema');

  execSync(`npm install "${netTgz}"`, {
    cwd: testProjectDir,
    stdio: 'inherit',
    env: npmEnv,
  });
  pass('Installed @peac/net-node');

  // -----------------------------------------------------------------------------
  // Step 5: Test imports
  // -----------------------------------------------------------------------------

  log('\n--- Step 5: Testing imports ---\n');

  // Create test script
  const testScript = `
import { safeFetch, computeEvidenceDigest, SAFE_FETCH_ERROR_CODES } from '@peac/net-node';
import { _internals, SAFE_FETCH_ERROR_CODES as ERROR_CODES_TESTING } from '@peac/net-node/testing';

// Test 1: Main entry should NOT have _internals
const mainModule = await import('@peac/net-node');
const mainKeys = Object.keys(mainModule);

if (mainKeys.includes('_internals')) {
  console.error('FAIL: Main entry exports _internals');
  process.exit(1);
}
console.log('PASS: Main entry does NOT export _internals');

// Test 1b: Main entry should NOT have underscore-prefixed exports
// These pollute the public API surface and should be in the testing subpath only
const underscoreExports = mainKeys.filter(k => k.startsWith('_'));
if (underscoreExports.length > 0) {
  console.error('FAIL: Main entry has ' + underscoreExports.length + ' underscore-prefixed exports:');
  console.error('  ' + underscoreExports.join(', '));
  console.error('These should be accessed via @peac/net-node/testing instead');
  process.exit(1);
}
console.log('PASS: Main entry has no underscore-prefixed exports');

// Test 1c: Main entry should have ONLY the allowlisted exports
// This prevents accidental export of internal helpers
const PUBLIC_API_ALLOWLIST = new Set([
  // Core fetch functions
  'safeFetch',
  'safeFetchRaw',
  'safeFetchJson',
  'safeFetchJWKS',
  // Evidence functions
  'canonicalizeEvidence',
  'computeEvidenceDigest',
  // Default implementations
  'defaultDnsResolver',
  'defaultHttpClient',
  // Configuration constants
  'DEFAULT_TIMEOUT_MS',
  'DEFAULT_MAX_REDIRECTS',
  'DEFAULT_ALLOWED_METHODS',
  'DEFAULT_MAX_RESPONSE_BYTES',
  'DEFAULT_TIMEOUTS',
  'MAX_JWKS_RESPONSE_BYTES',
  'RESPONSE_BYTES_MEASUREMENT',
  // Error codes and acknowledgments
  'SAFE_FETCH_ERROR_CODES',
  'ALLOW_DANGEROUS_PORTS_ACK',
  'ALLOW_MIXED_DNS_ACK',
  'DANGEROUS_PORTS',
  // Schema versions
  'SAFE_FETCH_EVENT_SCHEMA_VERSION',
  'SAFE_FETCH_EVIDENCE_SCHEMA_VERSION',
  // Audit queue
  'MAX_PENDING_AUDIT_EVENTS',
  'getAuditQueueStats',
]);

const unexpectedExports = mainKeys.filter(k => !PUBLIC_API_ALLOWLIST.has(k));
if (unexpectedExports.length > 0) {
  console.error('FAIL: Main entry has ' + unexpectedExports.length + ' exports not in allowlist:');
  console.error('  ' + unexpectedExports.join(', '));
  console.error('If these are intentional public API additions, update PUBLIC_API_ALLOWLIST in test-pack-install.mjs');
  process.exit(1);
}
console.log('PASS: Main entry exports match allowlist (' + mainKeys.length + ' exports)');

// Test 2: Main entry should have expected public exports
const expectedPublic = ['safeFetch', 'computeEvidenceDigest', 'canonicalizeEvidence'];
for (const name of expectedPublic) {
  if (!mainKeys.includes(name)) {
    console.error('FAIL: Main entry missing expected export:', name);
    process.exit(1);
  }
}
console.log('PASS: Main entry has expected public exports');

// Test 3: Testing entry should have _internals
if (typeof _internals !== 'object' || _internals === null) {
  console.error('FAIL: Testing entry does not export _internals object');
  process.exit(1);
}
console.log('PASS: Testing entry exports _internals object');

// Test 4: _internals should have finalizeEvidence
if (typeof _internals.finalizeEvidence !== 'function') {
  console.error('FAIL: _internals.finalizeEvidence is not a function');
  process.exit(1);
}
console.log('PASS: _internals.finalizeEvidence is a function');

// Test 5: _internals should have other expected internals
const expectedInternals = [
  'isPrivateIP',
  'resolveDnsSecure',
  'parseCidr',
  'matchesAnyCidr',
  'jcsCanonicalizeValue',
];

for (const name of expectedInternals) {
  if (typeof _internals[name] !== 'function') {
    console.error('FAIL: _internals.' + name + ' is not a function');
    process.exit(1);
  }
}
console.log('PASS: _internals has all expected internal functions');

// Test 6: safeFetch should be callable (smoke test)
if (typeof safeFetch !== 'function') {
  console.error('FAIL: safeFetch is not a function');
  process.exit(1);
}
console.log('PASS: safeFetch is a function');

// Test 7: computeEvidenceDigest should work
const testEvidence = {
  schema_version: 'peac-safe-fetch-evidence/0.1',
  request_url: 'https://example.com',
  request_method: 'GET',
  response_status: 200,
  request_timestamp: Date.now(),
  response_timestamp: Date.now(),
  policy_decision: 'allow',
  decision_code: 'ALLOWED_PUBLIC_IP',
  evidence_level: 'public',
  resolved_ips: [],
};

try {
  const digest = computeEvidenceDigest(testEvidence);
  if (!digest.startsWith('0x') || digest.length !== 66) {
    console.error('FAIL: computeEvidenceDigest returned invalid digest:', digest);
    process.exit(1);
  }
  console.log('PASS: computeEvidenceDigest works correctly');
} catch (e) {
  console.error('FAIL: computeEvidenceDigest threw:', e.message);
  process.exit(1);
}

// Test 8: Deep imports should be blocked by exports map
// This ensures internal modules cannot be imported directly
const blockedImports = [
  '@peac/net-node/internal',
  '@peac/net-node/dist/internal',
  '@peac/net-node/evidence-utils',
  '@peac/net-node/dist/evidence-utils',
  // impl.ts contains internal helpers - must not be directly importable
  '@peac/net-node/impl',
  '@peac/net-node/dist/impl',
  // Single-source-of-truth modules - internal only
  '@peac/net-node/codes',
  '@peac/net-node/dist/codes',
  '@peac/net-node/constants',
  '@peac/net-node/dist/constants',
];

for (const blocked of blockedImports) {
  try {
    await import(blocked);
    console.error('FAIL: Deep import should be blocked:', blocked);
    process.exit(1);
  } catch (e) {
    if (e.code === 'ERR_PACKAGE_PATH_NOT_EXPORTED' || e.code === 'ERR_MODULE_NOT_FOUND') {
      // Expected - exports map blocked the import
    } else {
      console.error('FAIL: Unexpected error for blocked import:', blocked, e.code, e.message);
      process.exit(1);
    }
  }
}
console.log('PASS: Deep imports correctly blocked by exports map');

console.log('\\nAll import tests passed!');
`;

  writeFileSync(join(testProjectDir, 'test.mjs'), testScript);

  // Run the test script
  try {
    execSync('node test.mjs', {
      cwd: testProjectDir,
      stdio: 'inherit',
    });
    pass('All import tests passed');
  } catch (e) {
    fail('Import tests failed');
  }

  // -----------------------------------------------------------------------------
  // Cleanup
  // -----------------------------------------------------------------------------

  log('\n--- Cleanup ---\n');

  rmSync(tempPackDir, { recursive: true, force: true });
  rmSync(testProjectDir, { recursive: true, force: true });

  log('Cleaned up temp directories');

  // -----------------------------------------------------------------------------
  // Summary
  // -----------------------------------------------------------------------------

  log(`\n${GREEN}=== All pack-install tests passed ===${RESET}\n`);
} catch (e) {
  console.error('Error:', e.message);

  // Cleanup on error
  try {
    rmSync(tempPackDir, { recursive: true, force: true });
  } catch {}
  if (testProjectDir) {
    try {
      rmSync(testProjectDir, { recursive: true, force: true });
    } catch {}
  }

  process.exit(1);
}
