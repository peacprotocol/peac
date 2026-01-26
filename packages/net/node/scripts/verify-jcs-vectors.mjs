#!/usr/bin/env node

/**
 * JCS Golden Vector Verifier
 *
 * Verifies that the golden vectors in jcs-golden-vectors.json match
 * the expected digests computed by the SHIPPED canonicalizeEvidence and
 * computeEvidenceDigest functions from the BUILT ARTIFACT.
 *
 * CRITICAL: This script imports from dist/index.js directly to ensure
 * we are testing the actual published artifact, not source code via
 * bundler/test runner resolution.
 *
 * Usage:
 *   node packages/net/scripts/verify-jcs-vectors.mjs
 *   node packages/net/scripts/verify-jcs-vectors.mjs --regenerate
 *
 * Exit codes:
 * - 0: Vectors match (no drift)
 * - 1: Drift detected (vectors need regeneration)
 * - 2: Script error (import failure, etc.)
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = join(__dirname, '..', 'tests', 'fixtures', 'jcs-golden-vectors.json');
const DIST_PATH = join(__dirname, '..', 'dist', 'index.js');
const DIST_URL = pathToFileURL(DIST_PATH).href;

// CLI flags
const REGENERATE = process.argv.includes('--regenerate');

async function main() {
  console.log('JCS Golden Vector Verifier');
  console.log('==========================');
  console.log();

  // Import the SHIPPED implementation from the built artifact
  // Use file URL for maximum Node.js version compatibility
  console.log(`Loading shipped implementation from: ${DIST_URL}`);
  console.log();

  let canonicalizeEvidence, computeEvidenceDigest;
  try {
    const distModule = await import(DIST_URL);
    canonicalizeEvidence = distModule.canonicalizeEvidence;
    computeEvidenceDigest = distModule.computeEvidenceDigest;

    if (typeof canonicalizeEvidence !== 'function') {
      throw new Error('canonicalizeEvidence is not a function');
    }
    if (typeof computeEvidenceDigest !== 'function') {
      throw new Error('computeEvidenceDigest is not a function');
    }
  } catch (err) {
    console.error('ERROR: Failed to load shipped implementation from dist/index.js');
    console.error(`  ${err.message}`);
    console.error();
    console.error('Make sure to run `pnpm build` first.');
    process.exit(2);
  }

  // Load fixtures
  let fixtures;
  try {
    fixtures = JSON.parse(readFileSync(FIXTURE_PATH, 'utf-8'));
  } catch (err) {
    console.error(`ERROR: Failed to read fixtures: ${err.message}`);
    process.exit(2);
  }

  if (REGENERATE) {
    console.log('Regenerating golden vectors using SHIPPED implementation...');
    console.log();

    const results = [];
    for (const tc of fixtures.test_cases) {
      const { name, input, note } = tc;
      try {
        const canonical = canonicalizeEvidence(input);
        const digest = await computeEvidenceDigest(input);
        console.log(`  [REGEN] ${name}`);
        results.push({ name, input, canonical, digest, ...(note ? { note } : {}) });
      } catch (err) {
        console.log(`  [SKIP] ${name}: ${err.message}`);
        // Keep original entry for invalid inputs
        results.push(tc);
      }
    }

    const updated = { ...fixtures, test_cases: results };
    writeFileSync(FIXTURE_PATH, JSON.stringify(updated, null, 2) + '\n');
    console.log();
    console.log(`Regenerated: ${FIXTURE_PATH}`);
    console.log('Run git diff to review changes.');
    console.log();
    console.log('IMPORTANT: Re-run without --regenerate to verify.');
    process.exit(0);
  }

  // Verify mode: check each vector against shipped implementation
  console.log('Verifying golden vectors against shipped implementation...');
  console.log();

  let passed = 0;
  let failed = 0;
  let skipped = 0;

  for (const tc of fixtures.test_cases) {
    const { name, input, canonical: expectedCanonical, digest: expectedDigest } = tc;

    // Skip vectors that don't have expected values (e.g., invalid inputs)
    if (!expectedCanonical || !expectedDigest) {
      skipped++;
      continue;
    }

    try {
      const actualCanonical = canonicalizeEvidence(input);
      const actualDigest = await computeEvidenceDigest(input);

      if (actualCanonical !== expectedCanonical) {
        console.log(`  [FAIL] ${name}`);
        console.log(`    Canonical mismatch:`);
        console.log(`      Expected: ${expectedCanonical}`);
        console.log(`      Actual:   ${actualCanonical}`);
        failed++;
        continue;
      }

      if (actualDigest !== expectedDigest) {
        console.log(`  [FAIL] ${name}`);
        console.log(`    Digest mismatch:`);
        console.log(`      Expected: ${expectedDigest}`);
        console.log(`      Actual:   ${actualDigest}`);
        failed++;
        continue;
      }

      console.log(`  [PASS] ${name}`);
      passed++;
    } catch (err) {
      console.log(`  [FAIL] ${name}: ${err.message}`);
      failed++;
    }
  }

  console.log();
  console.log(`Results: ${passed} passed, ${failed} failed, ${skipped} skipped`);

  if (failed > 0) {
    console.log();
    console.log('DRIFT DETECTED: Vectors do not match shipped implementation.');
    console.log('Run with --regenerate to update fixtures, then re-verify.');
    process.exit(1);
  }

  console.log();
  console.log('All vectors verified against shipped implementation.');
  process.exit(0);
}

main().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(2);
});
