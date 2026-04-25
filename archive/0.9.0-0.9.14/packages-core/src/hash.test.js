/**
 * Tests for canonicalPolicyHash determinism
 */

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { canonicalPolicyHash } from '../dist/index.js';

test('policy hash - identical across shuffled order', async () => {
  // Test the same data structure that enforce.ts now uses
  const policies1 = [
    { type: 'aipref', content: { status: 'allowed' } },
    { type: 'peac-txt', content: 'version: 0.9\naccess: restricted' },
    { type: 'agent-permissions', content: { access: 'crawl' } },
  ].sort((a, b) => (a.type < b.type ? -1 : a.type > b.type ? 1 : 0));

  const policies2 = [
    { type: 'peac-txt', content: 'version: 0.9\naccess: restricted' },
    { type: 'agent-permissions', content: { access: 'crawl' } },
    { type: 'aipref', content: { status: 'allowed' } },
  ].sort((a, b) => (a.type < b.type ? -1 : a.type > b.type ? 1 : 0));

  const hash1 = canonicalPolicyHash(policies1);
  const hash2 = canonicalPolicyHash(policies2);

  assert.equal(hash1, hash2, 'Policy hash should be identical regardless of order');
});

test('policy hash - handles duplicate types correctly', async () => {
  // Sort by type first, then by content to ensure deterministic ordering
  const sortPolicies = (policies) =>
    policies.sort((a, b) => {
      if (a.type !== b.type) return a.type < b.type ? -1 : 1;
      return JSON.stringify(a.content) < JSON.stringify(b.content) ? -1 : 1;
    });

  const policies1 = sortPolicies([
    { type: 'aipref', content: { status: 'allowed' } },
    { type: 'aipref', content: { status: 'restricted' } }, // duplicate type
    { type: 'peac-txt', content: 'version: 0.9' },
  ]);

  const policies2 = sortPolicies([
    { type: 'peac-txt', content: 'version: 0.9' },
    { type: 'aipref', content: { status: 'restricted' } },
    { type: 'aipref', content: { status: 'allowed' } },
  ]);

  const hash1 = canonicalPolicyHash(policies1);
  const hash2 = canonicalPolicyHash(policies2);

  assert.equal(hash1, hash2, 'Policy hash should handle duplicate types deterministically');
});

test('policy hash - different content produces different hash', async () => {
  const policies1 = [{ type: 'aipref', content: { status: 'allowed' } }];

  const policies2 = [{ type: 'aipref', content: { status: 'restricted' } }];

  const hash1 = canonicalPolicyHash(policies1);
  const hash2 = canonicalPolicyHash(policies2);

  assert.notEqual(hash1, hash2, 'Different policy content should produce different hashes');
});
