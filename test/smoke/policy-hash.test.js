/**
 * Policy hash smoke test - validates 3 golden vectors
 */

import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { canonicalPolicyHash } from '../../packages/core/dist/index.js';

test('Policy hash vector 1 - Basic URL normalization', async () => {
  const vector = JSON.parse(readFileSync('fixtures/policy-hash/vector1.json', 'utf8'));

  const actualHash = canonicalPolicyHash(vector.input);

  console.log(`Expected: ${vector.expected_hash}`);
  console.log(`Actual:   ${actualHash}`);

  assert.strictEqual(
    actualHash,
    vector.expected_hash,
    `Policy hash mismatch for vector 1: ${vector.name}`
  );
});

test('Policy hash vector 2 - Complex normalization', async () => {
  const vector = JSON.parse(readFileSync('fixtures/policy-hash/vector2.json', 'utf8'));

  const actualHash = canonicalPolicyHash(vector.input);

  console.log(`Expected: ${vector.expected_hash}`);
  console.log(`Actual:   ${actualHash}`);

  assert.strictEqual(
    actualHash,
    vector.expected_hash,
    `Policy hash mismatch for vector 2: ${vector.name}`
  );
});

test('Policy hash vector 3 - Edge cases', async () => {
  const vector = JSON.parse(readFileSync('fixtures/policy-hash/vector3.json', 'utf8'));

  const actualHash = canonicalPolicyHash(vector.input);

  console.log(`Expected: ${vector.expected_hash}`);
  console.log(`Actual:   ${actualHash}`);

  assert.strictEqual(
    actualHash,
    vector.expected_hash,
    `Policy hash mismatch for vector 3: ${vector.name}`
  );
});

test('Policy hash deterministic - same input produces same hash', () => {
  const input = {
    resource: 'https://example.com/test',
    purpose: 'analysis',
    timestamp: 1694616000,
  };

  const hash1 = canonicalPolicyHash(input);
  const hash2 = canonicalPolicyHash(input);

  assert.strictEqual(hash1, hash2, 'Policy hash must be deterministic');
});

test('Policy hash different - different inputs produce different hashes', () => {
  const input1 = { resource: 'https://example.com/test' };
  const input2 = { resource: 'https://example.com/different' };

  const hash1 = canonicalPolicyHash(input1);
  const hash2 = canonicalPolicyHash(input2);

  assert.notStrictEqual(hash1, hash2, 'Different inputs must produce different hashes');
});

test('Policy hash query parameter order preservation', () => {
  // Query param order must be preserved (no reordering)
  const input1 = { resource: 'https://example.com/test?a=1&b=2' };
  const input2 = { resource: 'https://example.com/test?b=2&a=1' };

  const hash1 = canonicalPolicyHash(input1);
  const hash2 = canonicalPolicyHash(input2);

  // Different order should produce different hashes
  assert.notStrictEqual(hash1, hash2, 'Query parameter order must affect hash');

  // Same input twice should be identical
  const hash1_repeat = canonicalPolicyHash(input1);
  assert.strictEqual(hash1, hash1_repeat, 'Same query order must produce same hash');
});

test('Policy hash plus character in query params', () => {
  // Plus character in query should remain literal (not become space)
  const inputWithPlus = { resource: 'https://example.com/test?q=hello+world' };
  const inputWithSpace = { resource: 'https://example.com/test?q=hello world' };
  const inputWithEncodedSpace = { resource: 'https://example.com/test?q=hello%20world' };

  const hashPlus = canonicalPolicyHash(inputWithPlus);
  const hashSpace = canonicalPolicyHash(inputWithSpace);
  const hashEncoded = canonicalPolicyHash(inputWithEncodedSpace);

  // Plus should be different from space (URL normalization keeps plus as plus)
  assert.notStrictEqual(hashPlus, hashSpace, 'Plus and space should produce different hashes');

  // Space and %20 are equivalent after URL normalization
  assert.strictEqual(
    hashSpace,
    hashEncoded,
    'Space and encoded space should be equivalent after normalization'
  );

  // But plus should be different from both
  assert.notStrictEqual(
    hashPlus,
    hashEncoded,
    'Plus and encoded space should produce different hashes'
  );
});
