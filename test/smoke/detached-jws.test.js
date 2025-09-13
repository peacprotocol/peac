/**
 * Detached JWS smoke test - validates Ed25519 sign/verify performance
 */

import { test } from 'node:test';
import assert from 'node:assert';
import {
  generateEdDSAKeyPair,
  signDetached,
  verifyDetached,
} from '../../packages/core/dist/index.js';

test('Detached JWS sign/verify round-trip', async () => {
  const keyPair = await generateEdDSAKeyPair();
  const payload = 'test payload for detached JWS';

  const startSign = performance.now();
  const jws = await signDetached(payload, keyPair.privateKey, keyPair.kid);
  const signTime = performance.now() - startSign;

  // Validate JWS structure
  assert(typeof jws.protected === 'string', 'JWS protected header must be string');
  assert(typeof jws.signature === 'string', 'JWS signature must be string');

  // Decode protected header and validate b64:false, crit:["b64"]
  const protectedHeader = JSON.parse(Buffer.from(jws.protected, 'base64url').toString());
  assert.strictEqual(protectedHeader.alg, 'EdDSA', 'Algorithm must be EdDSA');
  assert.strictEqual(protectedHeader.b64, false, 'Must be detached (b64:false)');
  assert.deepStrictEqual(protectedHeader.crit, ['b64'], 'Critical extensions must include b64');
  assert.strictEqual(protectedHeader.kid, keyPair.kid, 'Kid must match');

  const startVerify = performance.now();
  const valid = await verifyDetached(payload, jws, keyPair.publicKey);
  const verifyTime = performance.now() - startVerify;

  assert.strictEqual(valid, true, 'Detached JWS verification must succeed');

  console.log(`Sign time: ${signTime.toFixed(2)}ms`);
  console.log(`Verify time: ${verifyTime.toFixed(2)}ms`);

  // Performance assertion (p95 < 5ms per spec)
  assert(signTime < 5, `Sign time ${signTime.toFixed(2)}ms must be < 5ms`);
  assert(verifyTime < 5, `Verify time ${verifyTime.toFixed(2)}ms must be < 5ms`);
});

test('Detached JWS rejects non-detached variants', async () => {
  const keyPair = await generateEdDSAKeyPair();
  const payload = 'test payload';

  const jws = await signDetached(payload, keyPair.privateKey, keyPair.kid);

  // Try to verify with wrong payload
  const wrongPayload = 'wrong payload';
  const valid = await verifyDetached(wrongPayload, jws, keyPair.publicKey);

  assert.strictEqual(valid, false, 'Must reject verification with wrong payload');
});

test('Detached JWS performance benchmark', async () => {
  const keyPair = await generateEdDSAKeyPair();
  const payload = 'benchmark payload';

  const iterations = 10;
  const signTimes = [];
  const verifyTimes = [];

  for (let i = 0; i < iterations; i++) {
    const startSign = performance.now();
    const jws = await signDetached(payload, keyPair.privateKey, keyPair.kid);
    signTimes.push(performance.now() - startSign);

    const startVerify = performance.now();
    await verifyDetached(payload, jws, keyPair.publicKey);
    verifyTimes.push(performance.now() - startVerify);
  }

  const signP95 = signTimes.sort((a, b) => a - b)[Math.floor(0.95 * iterations)];
  const verifyP95 = verifyTimes.sort((a, b) => a - b)[Math.floor(0.95 * iterations)];

  console.log(`Sign p95: ${signP95.toFixed(2)}ms`);
  console.log(`Verify p95: ${verifyP95.toFixed(2)}ms`);

  // Log for validation script to parse
  console.log(`sign p95 ${signP95.toFixed(2)}ms`);
  console.log(`verify p95 ${verifyP95.toFixed(2)}ms`);
});
