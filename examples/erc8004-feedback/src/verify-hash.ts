/**
 * Hash Verification Smoke Test (CI-Safe)
 *
 * Verifies both Mode A (direct receipt) and Mode B (wrapper) conformance vectors.
 * This test is deterministic and does not depend on generated files.
 *
 * Optionally validates generated/ files if they exist.
 */

import { keccak256 } from 'viem';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const GENERATED_DIR = join(__dirname, '..', 'generated');
const CONFORMANCE_DIR = join(
  __dirname,
  '..',
  '..',
  '..',
  'specs',
  'conformance',
  'erc8004-mapping'
);

// Use createRequire for ESM-safe import of CJS package
const require = createRequire(import.meta.url);
const { canonicalize } = require('@peac/crypto');

// Expected hashes - deterministic for conformance fixtures
const EXPECTED_RECEIPT_HASH = '0xf6194f761fdecef4eaf577f04465229551185e5e8e716d30d955f20eae12fafc';
const EXPECTED_WRAPPER_HASH = '0x58a0056caf5fb01a324b023bfac341b5fdef8fb8b21e7f7a4d0f279de3ec1083';
const EXPECTED_RECEIPT_SHA256 = 'xkkSOFHq6ZXPwpODsrDMdDLd2dIB4IO1mTJP-8tR2zU';

function computeHash(obj: object): `0x${string}` {
  const canonicalJson: string = canonicalize(obj);
  const canonicalBytes = new TextEncoder().encode(canonicalJson);
  return keccak256(canonicalBytes);
}

function computeSha256Base64url(obj: object): string {
  const canonicalJson: string = canonicalize(obj);
  const bytes = new TextEncoder().encode(canonicalJson);
  return createHash('sha256').update(bytes).digest('base64url');
}

function main() {
  console.log('ERC-8004 Conformance Verification\n');
  console.log('='.repeat(50) + '\n');

  let allPassed = true;

  // ============================================
  // Mode A: Direct PEAC Receipt
  // ============================================
  console.log('Mode A: Direct PEAC Receipt\n');

  const receiptPath = join(__dirname, 'peac-receipt.json');
  const receipt = JSON.parse(readFileSync(receiptPath, 'utf-8'));
  const receiptHash = computeHash(receipt);

  console.log(`  Input:     src/peac-receipt.json`);
  console.log(`  Computed:  ${receiptHash}`);
  console.log(`  Expected:  ${EXPECTED_RECEIPT_HASH}`);

  if (receiptHash !== EXPECTED_RECEIPT_HASH) {
    console.error('\n  ERROR: Mode A hash mismatch!');
    allPassed = false;
  } else {
    console.log('\n  ✓ Mode A verification passed\n');
  }

  // ============================================
  // Mode B: Wrapper File
  // ============================================
  console.log('Mode B: Wrapper File\n');

  const wrapperPath = join(CONFORMANCE_DIR, 'golden-wrapper.json');
  if (existsSync(wrapperPath)) {
    const wrapper = JSON.parse(readFileSync(wrapperPath, 'utf-8'));
    const wrapperHash = computeHash(wrapper);

    console.log(`  Input:     specs/conformance/erc8004-mapping/golden-wrapper.json`);
    console.log(`  Computed:  ${wrapperHash}`);
    console.log(`  Expected:  ${EXPECTED_WRAPPER_HASH}`);

    if (wrapperHash !== EXPECTED_WRAPPER_HASH) {
      console.error('\n  ERROR: Mode B hash mismatch!');
      allPassed = false;
    } else {
      console.log('\n  ✓ Mode B verification passed\n');
    }

    // Verify wrapper's peac.sha256 matches receipt SHA-256
    console.log('Mode B Binding Check (wrapper.peac.sha256):\n');

    const receiptSha256 = computeSha256Base64url(receipt);
    const wrapperPeacSha256 = wrapper.peac?.sha256;

    console.log(`  Receipt SHA-256:  ${receiptSha256}`);
    console.log(`  Wrapper binding:  ${wrapperPeacSha256}`);
    console.log(`  Expected:         ${EXPECTED_RECEIPT_SHA256}`);

    if (receiptSha256 !== EXPECTED_RECEIPT_SHA256) {
      console.error('\n  ERROR: Receipt SHA-256 mismatch!');
      allPassed = false;
    } else if (wrapperPeacSha256 !== EXPECTED_RECEIPT_SHA256) {
      console.error('\n  ERROR: Wrapper peac.sha256 binding mismatch!');
      allPassed = false;
    } else {
      console.log('\n  ✓ Mode B binding verification passed\n');
    }
  } else {
    console.log('  (Wrapper fixture not found - skipping Mode B)');
  }

  // ============================================
  // Optional: Generated Files Check
  // ============================================
  const canonicalPath = join(GENERATED_DIR, 'peac-receipt.canonical.json');
  const txArgsPath = join(GENERATED_DIR, 'giveFeedback-tx-args.json');

  if (existsSync(canonicalPath) && existsSync(txArgsPath)) {
    console.log('Generated Files Check:\n');

    const storedBytes = readFileSync(canonicalPath);
    const storedHash = keccak256(storedBytes);
    const txArgs = JSON.parse(readFileSync(txArgsPath, 'utf-8'));

    console.log(`  Canonical file hash:  ${storedHash}`);
    console.log(`  TxArgs feedbackHash:  ${txArgs.feedbackHash}`);

    if (storedHash !== receiptHash || txArgs.feedbackHash !== receiptHash) {
      console.error('\n  ERROR: Generated files mismatch!');
      allPassed = false;
    } else {
      console.log('\n  ✓ Generated files verification passed\n');
    }
  }

  // ============================================
  // Summary
  // ============================================
  console.log('='.repeat(50));
  if (allPassed) {
    console.log('\nAll conformance checks passed.\n');
  } else {
    console.error('\nSome checks failed!\n');
    process.exit(1);
  }
}

main();
