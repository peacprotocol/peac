/**
 * Replay protection smoke test - validates nonce cache TTL behavior
 */

import { test } from 'node:test';
import assert from 'node:assert';
import {
  InMemoryNonceCache,
  isReplayAttack,
  preventReplay,
  isValidNonce,
  uuidv7,
} from '../../packages/core/dist/index.js';

test('Nonce cache TTL behavior', async () => {
  const cache = new InMemoryNonceCache(1); // 1 second TTL for testing
  const nonce = uuidv7();

  // Initially nonce should not exist
  assert.strictEqual(cache.has(nonce), false, 'New nonce should not exist in cache');

  // Add nonce to cache
  cache.add(nonce);
  assert.strictEqual(cache.has(nonce), true, 'Added nonce should exist in cache');

  // Wait for TTL expiration
  await new Promise((resolve) => setTimeout(resolve, 1100));

  // Nonce should be expired
  assert.strictEqual(cache.has(nonce), false, 'Nonce should expire after TTL');

  cache.destroy();
});

test('Replay attack detection', () => {
  const cache = new InMemoryNonceCache(300); // 5 minutes default
  const nonce = uuidv7();

  // First use should be allowed
  assert.strictEqual(isReplayAttack(nonce, cache), false, 'First nonce use should be allowed');

  // Prevent replay
  preventReplay(nonce, cache);

  // Second use should be detected as replay
  assert.strictEqual(isReplayAttack(nonce, cache), true, 'Duplicate nonce should be replay attack');

  cache.destroy();
});

test('Nonce format validation', () => {
  // Valid UUIDv7 format
  const validNonce = uuidv7();
  assert.strictEqual(isValidNonce(validNonce), true, 'UUIDv7 should be valid nonce format');

  // Invalid formats
  assert.strictEqual(isValidNonce('not-a-uuid'), false, 'Random string should be invalid');
  assert.strictEqual(
    isValidNonce('01234567-89ab-cdef-1234-567890abcdef'),
    false,
    'UUIDv4 should be invalid'
  );
  assert.strictEqual(
    isValidNonce('01234567-89ab-7def-1234-567890abcdef'),
    false,
    'Wrong variant should be invalid'
  );
  assert.strictEqual(isValidNonce(''), false, 'Empty string should be invalid');
});

test('Cache cleanup functionality', async () => {
  const cache = new InMemoryNonceCache(0.1, 50); // 100ms TTL, 50ms cleanup interval

  const nonce1 = uuidv7();
  const nonce2 = uuidv7();

  cache.add(nonce1);
  cache.add(nonce2);

  assert.strictEqual(cache.size(), 2, 'Cache should contain 2 entries');

  // Wait for TTL to expire
  await new Promise((resolve) => setTimeout(resolve, 150));

  // Trigger cleanup
  cache.cleanup();

  assert.strictEqual(cache.size(), 0, 'Cache should be empty after cleanup');

  cache.destroy();
});

test('TTL constraint enforcement', () => {
  // Should accept 300 seconds (5 minutes max)
  const cache300 = new InMemoryNonceCache(300);
  assert.doesNotThrow(() => cache300.add(uuidv7(), 300), 'Should accept 300s TTL');
  cache300.destroy();

  // Should reject > 300 seconds
  assert.throws(
    () => new InMemoryNonceCache(301),
    /TTL cannot exceed 300 seconds/,
    'Should reject TTL > 300 seconds'
  );

  // Should reject adding with TTL > 300 seconds
  const cache = new InMemoryNonceCache();
  assert.throws(
    () => cache.add(uuidv7(), 301),
    /TTL cannot exceed 300 seconds/,
    'Should reject add with TTL > 300 seconds'
  );
  cache.destroy();
});

test('Default TTL is 300 seconds', () => {
  const cache = new InMemoryNonceCache();
  const nonce = uuidv7();

  cache.add(nonce);

  // Check that entry exists and will expire in ~300 seconds
  assert.strictEqual(cache.has(nonce), true, 'Nonce should exist with default TTL');

  cache.destroy();
});
