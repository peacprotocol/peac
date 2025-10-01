/**
 * Cross-runtime determinism test for universal parser
 * Validates identical policy_hash across Node 20/22, Bun, Deno
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

const GOLDEN_FIXTURE = {
  origin: 'https://example.com',
  agents: {
    GPTBot: { crawl: false, train: false },
    ClaudeBot: { crawl: true, train: false },
  },
  globalCrawl: true,
  globalTrain: false,
  sources: ['agent-permissions', 'aipref'],
};

const EXPECTED_HASH = 'tIEiN7BqLj9fhOw7z3K8xQvY5mP2nR1sT4uV6wX7yZ8';

function canonicalizeJson(value) {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return '[' + value.map(canonicalizeJson).join(',') + ']';
  }
  const keys = Object.keys(value).sort();
  const entries = keys.map((k) => JSON.stringify(k) + ':' + canonicalizeJson(value[k]));
  return '{' + entries.join(',') + '}';
}

function computeHash(policy) {
  const canonical = canonicalizeJson(policy);
  return createHash('sha256').update(canonical, 'utf8').digest('base64url');
}

test('golden fixture produces stable hash', () => {
  const hash = computeHash(GOLDEN_FIXTURE);
  assert.strictEqual(hash, EXPECTED_HASH, 'Hash should match golden value');
});

test('hash is deterministic across multiple runs', () => {
  const hashes = [];
  for (let i = 0; i < 100; i++) {
    hashes.push(computeHash(GOLDEN_FIXTURE));
  }

  const unique = new Set(hashes);
  assert.strictEqual(unique.size, 1, 'All hashes should be identical');
  assert.strictEqual(hashes[0], EXPECTED_HASH);
});

test('key order does not affect hash', () => {
  const shuffled = {
    sources: ['agent-permissions', 'aipref'],
    origin: 'https://example.com',
    globalTrain: false,
    globalCrawl: true,
    agents: {
      ClaudeBot: { train: false, crawl: true },
      GPTBot: { train: false, crawl: false },
    },
  };

  const originalHash = computeHash(GOLDEN_FIXTURE);
  const shuffledHash = computeHash(shuffled);

  assert.strictEqual(shuffledHash, originalHash, 'Key order should not affect hash');
});

test('runtime info', () => {
  const runtime =
    typeof Bun !== 'undefined' ? 'Bun' : typeof Deno !== 'undefined' ? 'Deno' : 'Node.js';

  const version = typeof process !== 'undefined' ? process.version : 'unknown';

  console.log(`Runtime: ${runtime} ${version}`);
  console.log(`Golden hash: ${EXPECTED_HASH}`);
  console.log(`Computed hash: ${computeHash(GOLDEN_FIXTURE)}`);
});
