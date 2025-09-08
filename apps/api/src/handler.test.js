/**
 * @peac/api/handler - Test verify API handler
 */

import { test } from 'node:test';
import assert from 'node:assert';
import { VerifyApiHandler } from '../dist/handler.js';

// Mock verify function
const mockVerifySuccess = async (jws, keys) => ({
  hdr: { alg: 'EdDSA', kid: 'test-key' },
  obj: { subject: { uri: 'https://example.com' }, issued_at: '2025-09-04T12:00:00Z' },
});

const mockVerifyFailure = async (jws, keys) => {
  throw new Error('Invalid signature');
};

const mockKeys = {
  'test-key': { kty: 'OKP', crv: 'Ed25519', x: 'test-public-key' },
};

test('VerifyApiHandler - successful verification', async () => {
  const handler = new VerifyApiHandler({
    verifyFn: mockVerifySuccess,
    defaultKeys: mockKeys,
  });

  const request = {
    receipt: 'eyJhbGciOiJFZERTQSJ9.eyJ0ZXN0IjoidHJ1ZSJ9.signature',
  };

  const result = await handler.handle(request);

  assert.strictEqual(result.status, 200);
  assert.strictEqual(result.body.valid, true);
  assert.strictEqual(result.body.receipt.header.alg, 'EdDSA');
  assert.strictEqual(result.body.verification.signature, 'valid');
  assert.strictEqual(result.body.verification.key_id, 'test-key');
});

test('VerifyApiHandler - signature verification failure', async () => {
  const handler = new VerifyApiHandler({
    verifyFn: mockVerifyFailure,
    defaultKeys: mockKeys,
  });

  const request = {
    receipt: 'eyJhbGciOiJFZERTQSJ9.eyJ0ZXN0IjoidHJ1ZSJ9.invalid-signature',
  };

  const result = await handler.handle(request);

  assert.strictEqual(result.status, 422);
  assert.strictEqual(result.body.type, 'https://peac.dev/problems/invalid-signature');
  assert.strictEqual(result.body.title, 'Invalid Signature');
  assert.strictEqual(result.body['peac-error-code'], 'invalid-signature');
});

test('VerifyApiHandler - missing receipt validation', async () => {
  const handler = new VerifyApiHandler({
    verifyFn: mockVerifySuccess,
    defaultKeys: mockKeys,
  });

  const request = {};

  const result = await handler.handle(request);

  assert.strictEqual(result.status, 422);
  assert.strictEqual(result.body.type, 'https://peac.dev/problems/schema-validation-failed');
  assert.strictEqual(result.body['validation-failures'][0], 'receipt field is required');
});

test('VerifyApiHandler - invalid JWS format validation', async () => {
  const handler = new VerifyApiHandler({
    verifyFn: mockVerifySuccess,
    defaultKeys: mockKeys,
  });

  const request = {
    receipt: 'invalid-jws-format',
  };

  const result = await handler.handle(request);

  assert.strictEqual(result.status, 422);
  assert(result.body['validation-failures'][0].includes('valid JWS compact serialization'));
});

test('VerifyApiHandler - uses custom keys when provided', async () => {
  let capturedKeys;
  const mockVerifyWithCapture = async (jws, keys) => {
    capturedKeys = keys;
    return mockVerifySuccess(jws, keys);
  };

  const handler = new VerifyApiHandler({
    verifyFn: mockVerifyWithCapture,
    defaultKeys: mockKeys,
  });

  const customKeys = { 'custom-key': { kty: 'OKP', crv: 'Ed25519', x: 'custom' } };
  const request = {
    receipt: 'eyJhbGciOiJFZERTQSJ9.eyJ0ZXN0IjoidHJ1ZSJ9.signature',
    keys: customKeys,
  };

  await handler.handle(request);

  assert.deepStrictEqual(capturedKeys, customKeys);
});
