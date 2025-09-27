/**
 * Policy hash smoke test - validates 3 golden vectors
 */

import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { canonicalPolicyHash } from '@peac/core';

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
