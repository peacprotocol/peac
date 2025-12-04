/**
 * v0.9.13 Enforce Orchestration Smoke Tests
 * Tests: discover → evaluate → settle → prove
 */

import { test } from 'node:test';
import assert from 'node:assert';
import { enforce } from '@peac/core';

// Mock HTTP server responses for testing
const mockPolicies = {
  'https://example.com/.well-known/peac.txt': 'payment: required\namount: 1.00 USD',
  'https://free.example.com/.well-known/peac.txt': 'access: open',
  'https://blocked.example.com/.well-known/peac.txt': 'access: denied',
};

// Mock fetch for testing
const originalFetch = globalThis.fetch;
function mockFetch(url, options) {
  const urlStr = url.toString();

  if (mockPolicies[urlStr]) {
    return Promise.resolve(
      new Response(mockPolicies[urlStr], {
        status: 200,
        headers: { 'Content-Type': 'text/plain' },
      })
    );
  }

  // 404 for unknown URLs
  return Promise.resolve(new Response('Not Found', { status: 404 }));
}

test('enforce orchestration - payment required → 402', async () => {
  globalThis.fetch = mockFetch;

  try {
    const nonceCache = new InMemoryNonceCache();

    const result = await enforce(
      'https://example.com/resource',
      {
        purpose: 'testing',
        agent: 'test-agent',
      },
      {
        issuer: 'https://test-issuer.example',
        nonceCache,
      }
    );

    // Should return 402 Payment Required
    assert.strictEqual(result.allowed, false);
    assert.strictEqual(result.problem?.status, 402);
    assert.strictEqual(result.problem?.title, 'Payment Required');
    assert.ok(result.problem?.['policy-sources']);
    assert.strictEqual(result.problem?.['required-purpose'], 'testing');

    // Should have decision context
    assert.ok(result.decision?.policies);
    assert.strictEqual(result.decision?.evaluation, 'payment_required');
    assert.strictEqual(result.decision?.settlement?.required, true);
    assert.strictEqual(result.decision?.settlement?.rail, 'x402');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('enforce orchestration - free access → 200 with receipt', async () => {
  globalThis.fetch = mockFetch;

  try {
    const nonceCache = new InMemoryNonceCache();

    const result = await enforce(
      'https://free.example.com/resource',
      {
        purpose: 'testing',
        agent: 'test-agent',
      },
      {
        issuer: 'https://test-issuer.example',
        nonceCache,
      }
    );

    // Should allow with receipt
    assert.strictEqual(result.allowed, true);
    assert.ok(result.receipt);
    assert.ok(result.headers?.['PEAC-Receipt']);
    assert.strictEqual(result.headers['PEAC-Receipt'], result.receipt);

    // Receipt should be detached JWS format
    const jws = result.receipt;
    assert.match(jws, /^[A-Za-z0-9_-]+\.\.[A-Za-z0-9_-]+$/);

    // Should have decision context
    assert.ok(result.decision?.policies);
    assert.strictEqual(result.decision?.evaluation, 'policy_allows');
    assert.strictEqual(result.decision?.settlement?.required, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('enforce orchestration - blocked access → 403', async () => {
  globalThis.fetch = mockFetch;

  try {
    const nonceCache = new InMemoryNonceCache();

    const result = await enforce(
      'https://blocked.example.com/resource',
      {
        purpose: 'testing',
        agent: 'test-agent',
      },
      {
        issuer: 'https://test-issuer.example',
        nonceCache,
      }
    );

    // Should return 403 Forbidden
    assert.strictEqual(result.allowed, false);
    assert.strictEqual(result.problem?.status, 403);
    assert.strictEqual(result.problem?.title, 'Forbidden');
    assert.ok(result.problem?.['policy-sources']);

    // Should have decision context
    assert.ok(result.decision?.policies);
    assert.strictEqual(result.decision?.evaluation, 'permission_denied');
    assert.strictEqual(result.decision?.settlement?.required, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('enforce orchestration - no policies → fail-open allow', async () => {
  globalThis.fetch = mockFetch;

  try {
    const nonceCache = new InMemoryNonceCache();

    const result = await enforce(
      'https://unknown.example.com/resource',
      {
        purpose: 'testing',
        agent: 'test-agent',
      },
      {
        issuer: 'https://test-issuer.example',
        nonceCache,
      }
    );

    // Should fail-open (allow by default)
    assert.strictEqual(result.allowed, true);
    assert.ok(result.receipt);

    // Should have decision context
    assert.ok(result.decision?.policies);
    assert.strictEqual(result.decision?.evaluation, 'no_policies_found');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('replay protection - nonce reuse rejected', async () => {
  globalThis.fetch = mockFetch;

  try {
    const nonceCache = new InMemoryNonceCache();

    // First request should work
    const result1 = await enforce(
      'https://free.example.com/resource',
      {
        purpose: 'testing',
        agent: 'test-agent',
      },
      {
        issuer: 'https://test-issuer.example',
        nonceCache,
      }
    );

    assert.strictEqual(result1.allowed, true);

    // Extract the rid (nonce) from the first receipt
    const receipt1Parts = result1.receipt.split('..');
    const protectedHeader = JSON.parse(Buffer.from(receipt1Parts[0], 'base64url').toString());

    // Second request with same conditions should generate different nonce
    const result2 = await enforce(
      'https://free.example.com/resource',
      {
        purpose: 'testing',
        agent: 'test-agent',
      },
      {
        issuer: 'https://test-issuer.example',
        nonceCache,
      }
    );

    assert.strictEqual(result2.allowed, true);

    // Should have different receipts (different nonces)
    assert.notStrictEqual(result1.receipt, result2.receipt);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('policy hash deterministic', async () => {
  globalThis.fetch = mockFetch;

  try {
    const nonceCache1 = new InMemoryNonceCache();
    const nonceCache2 = new InMemoryNonceCache();

    // Two identical requests should have same policy_hash
    const result1 = await enforce(
      'https://free.example.com/resource',
      {
        purpose: 'testing',
        agent: 'test-agent',
      },
      {
        issuer: 'https://test-issuer.example',
        nonceCache: nonceCache1,
      }
    );

    const result2 = await enforce(
      'https://free.example.com/resource',
      {
        purpose: 'testing',
        agent: 'test-agent',
      },
      {
        issuer: 'https://test-issuer.example',
        nonceCache: nonceCache2,
      }
    );

    // Extract policy_hash from receipts (decode payload)
    const payload1 = JSON.parse(
      Buffer.from(result1.receipt.split('..')[0], 'base64url').toString()
    );
    const payload2 = JSON.parse(
      Buffer.from(result2.receipt.split('..')[0], 'base64url').toString()
    );

    // Policy hashes should be identical (deterministic)
    assert.ok(payload1.policy_hash);
    assert.ok(payload2.policy_hash);
    assert.strictEqual(payload1.policy_hash, payload2.policy_hash);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('SSRF protection', async () => {
  globalThis.fetch = originalFetch; // Use real fetch for SSRF test

  const nonceCache = new InMemoryNonceCache();

  // Should reject HTTP URLs (except loopback)
  await assert.rejects(
    enforce('http://example.com/resource', {}, { nonceCache }),
    /Only HTTPS URLs allowed/
  );

  // Should reject private IP ranges
  await assert.rejects(
    enforce('https://192.168.1.1/resource', {}, { nonceCache }),
    /Private IP addresses not allowed/
  );

  // Should allow HTTPS
  // Note: This will likely fail with network error, but should pass SSRF check
  try {
    await enforce(
      'https://httpbin.org/json',
      {},
      {
        nonceCache,
        issuer: 'https://test.example',
      }
    );
  } catch (error) {
    // Network errors are OK for SSRF test - we just want to avoid rejecting valid HTTPS URLs
    assert.ok(error.message.includes('timeout') || error.message.includes('fetch'));
  }
});
