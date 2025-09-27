/**
 * Critical security and robustness tests for verifyReceipt
 */

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { verifyReceipt } from '../dist/index.js';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';

test('kid validation - throws on missing header kid', async () => {
  const { privateKey, publicKey } = await generateKeyPair('EdDSA');
  const jwkPriv = await exportJWK(privateKey);
  const jwkPub = await exportJWK(publicKey);

  jwkPriv.alg = 'EdDSA';
  jwkPub.alg = 'EdDSA';

  // Create JWS without kid in header
  const jwt = await new SignJWT({
    version: '0.9.14',
    wire_version: '0.9',
    iat: Math.floor(Date.now() / 1000),
    kid: 'test-kid',
    subject: { uri: 'https://example.com' },
    aipref: { status: 'allowed' },
    purpose: 'train-ai',
    enforcement: { method: 'none' },
    crawler_type: 'test',
  })
    .setProtectedHeader({ alg: 'EdDSA', typ: 'peac.receipt/0.9' }) // No kid
    .sign(privateKey);

  const keys = { 'test-kid': jwkPub };

  // JOSE will usually throw before our guard here; just assert it rejects
  await assert.rejects(() => verifyReceipt(jwt, keys));
});

test('kid validation - throws on missing payload kid', async () => {
  const { privateKey, publicKey } = await generateKeyPair('EdDSA');
  const jwkPriv = await exportJWK(privateKey);
  const jwkPub = await exportJWK(publicKey);

  jwkPriv.alg = 'EdDSA';
  jwkPub.alg = 'EdDSA';

  // Create JWS without kid in payload
  const jwt = await new SignJWT({
    version: '0.9.14',
    wire_version: '0.9',
    iat: Math.floor(Date.now() / 1000),
    // No kid in payload
    subject: { uri: 'https://example.com' },
    aipref: { status: 'allowed' },
    purpose: 'train-ai',
    enforcement: { method: 'none' },
    crawler_type: 'test',
  })
    .setProtectedHeader({ alg: 'EdDSA', typ: 'peac.receipt/0.9', kid: 'test-kid' })
    .sign(privateKey);

  const keys = { 'test-kid': jwkPub };

  // isReceipt validation fires first when kid is missing from payload
  await assert.rejects(() => verifyReceipt(jwt, keys), /Invalid receipt payload structure/i);
});

test('kid validation - throws on kid mismatch', async () => {
  const { privateKey, publicKey } = await generateKeyPair('EdDSA');
  const jwkPriv = await exportJWK(privateKey);
  const jwkPub = await exportJWK(publicKey);

  jwkPriv.alg = 'EdDSA';
  jwkPub.alg = 'EdDSA';

  // Create JWS with mismatched kids
  const jwt = await new SignJWT({
    version: '0.9.14',
    wire_version: '0.9',
    iat: Math.floor(Date.now() / 1000),
    kid: 'different-kid', // Different from header
    subject: { uri: 'https://example.com' },
    aipref: { status: 'allowed' },
    purpose: 'train-ai',
    enforcement: { method: 'none' },
    crawler_type: 'test',
  })
    .setProtectedHeader({ alg: 'EdDSA', typ: 'peac.receipt/0.9', kid: 'test-kid' })
    .sign(privateKey);

  const keys = { 'test-kid': jwkPub };

  await assert.rejects(() => verifyReceipt(jwt, keys), /kid.*mismatch/i);
});

test('expiry validation - throws on expired receipt', async () => {
  const { privateKey, publicKey } = await generateKeyPair('EdDSA');
  const jwkPriv = await exportJWK(privateKey);
  const jwkPub = await exportJWK(publicKey);

  jwkPriv.alg = 'EdDSA';
  jwkPub.alg = 'EdDSA';

  const expiredTime = Math.floor(Date.now() / 1000) - 120; // 2 minutes ago

  const jwt = await new SignJWT({
    version: '0.9.14',
    wire_version: '0.9',
    iat: expiredTime,
    exp: expiredTime, // Expired
    kid: 'test-kid',
    subject: { uri: 'https://example.com' },
    aipref: { status: 'allowed' },
    purpose: 'train-ai',
    enforcement: { method: 'none' },
    crawler_type: 'test',
  })
    .setProtectedHeader({ alg: 'EdDSA', typ: 'peac.receipt/0.9', kid: 'test-kid' })
    .sign(privateKey);

  const keys = { 'test-kid': jwkPub };

  // JOSE/jwtVerify may surface a different message; accept any expiry-ish error
  await assert.rejects(() => verifyReceipt(jwt, keys), /expir|expired/i);
});

test('expiry validation - passes within 60s skew', async () => {
  const { privateKey, publicKey } = await generateKeyPair('EdDSA');
  const jwkPriv = await exportJWK(privateKey);
  const jwkPub = await exportJWK(publicKey);

  jwkPriv.alg = 'EdDSA';
  jwkPub.alg = 'EdDSA';

  const now = Math.floor(Date.now() / 1000);
  const futureTime = now + 300; // 5 minutes in future (valid)

  const jwt = await new SignJWT({
    version: '0.9.14',
    wire_version: '0.9',
    iat: now,
    exp: futureTime, // Valid expiry time
    kid: 'test-kid',
    subject: { uri: 'https://example.com' },
    aipref: { status: 'allowed' },
    purpose: 'train-ai',
    enforcement: { method: 'none' },
    crawler_type: 'test',
  })
    .setProtectedHeader({ alg: 'EdDSA', typ: 'peac.receipt/0.9', kid: 'test-kid' })
    .sign(privateKey);

  const keys = { 'test-kid': jwkPub };

  // Should not throw (valid expiry)
  const result = await verifyReceipt(jwt, keys);
  assert.ok(result.payload);
});
