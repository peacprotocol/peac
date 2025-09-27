/**
 * @peac/sdk/client - Test PEAC client SDK functionality
 */

import { test } from 'node:test';
import assert from 'node:assert';
import { PeacClient } from '../dist/client.js';

// Mock modules by providing them as globals (simplified for testing)
const mockDiscoverResult = { valid: true, data: { verify: 'https://api.example.com/peac/verify' } };
const mockVerifyResult = {
  header: { alg: 'EdDSA', typ: 'peac.receipt/0.9', kid: 'test-key' },
  payload: {
    wire_version: '0.9',
    iat: Math.floor(Date.now() / 1000),
    kid: 'test-key',
    subject: { uri: 'https://example.com' },
    aipref: { status: 'allowed' },
    purpose: 'train-ai',
    enforcement: { method: 'none' },
    crawler_type: 'test',
  },
  signature: 'test-signature',
};

// Mock imports (would normally use a proper mocking framework)
global.mockDiscover = () => mockDiscoverResult;
global.mockVerify = () => mockVerifyResult;

test('PeacClient - discover caches results', async () => {
  const client = new PeacClient({
    inject: {
      disc: { discover: async () => mockDiscoverResult },
    },
  });

  const result1 = await client.discover('https://example.com');
  const result2 = await client.discover('https://example.com');

  assert.strictEqual(result1.valid, true);
  assert.strictEqual(result1.cached, false);
  assert.strictEqual(result2.cached, true);
  assert.strictEqual(result2.discovery.verify, 'https://api.example.com/peac/verify');
});

test('PeacClient - verifyLocal requires keys', async () => {
  const client = new PeacClient();

  try {
    await client.verifyLocal('test.receipt.signature');
    assert.fail('Should have thrown error for missing keys');
  } catch (error) {
    assert.strictEqual(error.code, 'NO_KEYS');
    assert(error.message.includes('No keys provided'));
  }
});

test('PeacClient - verifyLocal with keys succeeds', async () => {
  const keys = { 'test-key': { kty: 'OKP', crv: 'Ed25519', x: 'test' } };
  const client = new PeacClient({
    defaultKeys: keys,
    inject: {
      core: { verifyReceipt: async () => mockVerifyResult },
      pref: { resolveAIPref: async () => ({ status: 'active' }) },
    },
  });

  // Create a test receipt with proper v0.9.14 format
  const testReceipt = [
    Buffer.from(
      JSON.stringify({ alg: 'EdDSA', typ: 'peac.receipt/0.9', kid: 'test-key' })
    ).toString('base64url'),
    Buffer.from(
      JSON.stringify({
        wire_version: '0.9',
        iat: Math.floor(Date.now() / 1000),
        kid: 'test-key',
        subject: { uri: 'https://example.com' },
        aipref: { status: 'allowed' },
        purpose: 'train-ai',
        enforcement: { method: 'none' },
        crawler_type: 'test',
      })
    ).toString('base64url'),
    'test-signature',
  ].join('.');

  const result = await client.verifyLocal(testReceipt, {
    validateAIPref: true,
  });

  assert.strictEqual(result.valid, true);
  assert.strictEqual(result.remote, false);
  assert.strictEqual(result.verification.signature, 'valid');
  assert.strictEqual(result.verification.aipref, 'valid');
  assert.strictEqual(result.verification.key_id, 'test-key');
});

test('PeacClient - verifyRemote auto-discovers endpoint', async () => {
  const client = new PeacClient();

  // Mock fetch
  global.fetch = async (url, options) => {
    if (url === 'https://api.example.com/peac/verify') {
      return {
        ok: true,
        json: () => ({
          valid: true,
          receipt: { header: mockVerifyResult.hdr, payload: mockVerifyResult.obj },
          verification: { signature: 'valid', schema: 'valid', timestamp: '2025-09-04T12:00:00Z' },
        }),
      };
    }
    throw new Error('Unexpected URL');
  };

  // Mock discovery
  client.discover = async () => ({
    origin: 'https://example.com',
    valid: true,
    discovery: { verify: 'https://api.example.com/peac/verify' },
  });

  const mockReceipt = Buffer.from(
    JSON.stringify({ subject: { uri: 'https://example.com/test' } })
  ).toString('base64url');
  const result = await client.verifyRemote(`header.${mockReceipt}.signature`);

  assert.strictEqual(result.valid, true);
  assert.strictEqual(result.remote, true);
});

test('PeacClient - verify falls back from local to remote', async () => {
  const client = new PeacClient();

  // Mock local verification failure
  client.verifyLocal = async () => {
    throw new Error('Local verification failed');
  };

  // Mock successful remote verification
  client.verifyRemote = async () => ({
    valid: true,
    remote: true,
    verification: { signature: 'valid', schema: 'valid', timestamp: '2025-09-04T12:00:00Z' },
  });

  const result = await client.verify('test.receipt.signature');

  assert.strictEqual(result.valid, true);
  assert.strictEqual(result.remote, true);
});

test('PeacClient - clearCache works', async () => {
  const client = new PeacClient();

  // Mock discovery
  client.discover = async () => ({ valid: true, cached: false });

  await client.discover('https://example.com');
  client.clearCache();

  const result = await client.discover('https://example.com');
  assert.strictEqual(result.cached, false);
});
