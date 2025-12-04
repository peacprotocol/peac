import { test } from 'node:test';
import assert from 'node:assert';
import { signReceipt, verifyReceipt } from '@peac/core';
import { generateKeyPair, exportJWK } from 'jose';

test('receipt sign/verify round-trip', async () => {
  const { privateKey, publicKey } = await generateKeyPair('EdDSA');
  const jwkPriv = await exportJWK(privateKey);
  const jwkPub = await exportJWK(publicKey);

  const receipt = {
    version: '0.9.14',
    protocol_version: '0.9.14',
    wire_version: '0.9',
    kid: 'k1',
    iat: Math.floor(Date.now() / 1000),
    subject: { uri: 'https://example.com/resource' },
    aipref: { status: 'active' },
  };

  const jws = await signReceipt(receipt, {
    kid: 'k1',
    privateKey: { kty: 'OKP', crv: 'Ed25519', d: jwkPriv.d, x: jwkPriv.x },
  });

  const { payload } = await verifyReceipt(jws, {
    k1: { kty: 'OKP', crv: 'Ed25519', x: jwkPub.x },
  });

  assert.equal(payload.version, '0.9.14');
  assert.equal(payload.wire_version, '0.9');
  assert.equal(payload.kid, 'k1');
  assert.equal(payload.subject.uri, 'https://example.com/resource');
});
