/**
 * Golden vector tests for Ed25519 JWS
 *
 * These tests verify sign/verify against deterministic vectors
 * generated from a known seed (SHA-256('peac-golden-vector-001')).
 * They MUST pass across library upgrades and runtime versions.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { sign, verify, decode } from '../src/jws';
import { generateKeypairFromSeed } from '../src/testkit';

const fixturesPath = resolve(
  __dirname,
  '../../../specs/conformance/fixtures/crypto/golden-vectors.json'
);
const fixtures = JSON.parse(readFileSync(fixturesPath, 'utf-8'));

describe('Ed25519 golden vectors', () => {
  for (const vector of fixtures.vectors) {
    it(`deterministic verification: ${vector.name}`, async () => {
      const publicKey = Buffer.from(vector.public_key_hex, 'hex');
      const result = await verify(vector.jws, new Uint8Array(publicKey));

      expect(result.valid).toBe(true);
      expect(result.header.typ).toBe(vector.header.typ);
      expect(result.header.alg).toBe(vector.header.alg);
      expect(result.header.kid).toBe(vector.header.kid);
      expect(result.payload).toEqual(vector.payload);
    });

    it(`deterministic sign reproduces golden JWS: ${vector.name}`, async () => {
      const seed = Buffer.from(vector.seed_hex, 'hex');
      const { privateKey } = await generateKeypairFromSeed(new Uint8Array(seed));

      const jws = await sign(vector.payload, privateKey, vector.header.kid);

      // Ed25519 signatures are deterministic -- same seed + payload = same JWS
      expect(jws).toBe(vector.jws);
    });

    it(`decode extracts correct header and payload: ${vector.name}`, () => {
      const decoded = decode(vector.jws);

      expect(decoded.header).toEqual(vector.header);
      expect(decoded.payload).toEqual(vector.payload);
    });
  }
});

describe('Ed25519 negative vectors', () => {
  const goldenVector = fixtures.vectors[0];
  const goldenPublicKey = new Uint8Array(Buffer.from(goldenVector.public_key_hex, 'hex'));

  it('wrong-public-key: verification fails with different key', async () => {
    const wrongKey = new Uint8Array(
      Buffer.from(fixtures.negative_vectors[0].wrong_public_key_hex, 'hex')
    );
    const result = await verify(goldenVector.jws, wrongKey);
    expect(result.valid).toBe(false);
  });

  it('tampered-payload: modified amt rejects', async () => {
    const parts = goldenVector.jws.split('.');
    const tamperedPayload = { ...goldenVector.payload, amt: 1 };
    const tamperedB64 = Buffer.from(JSON.stringify(tamperedPayload)).toString('base64url');
    const tamperedJws = `${parts[0]}.${tamperedB64}.${parts[2]}`;

    const result = await verify(tamperedJws, goldenPublicKey);
    expect(result.valid).toBe(false);
  });

  it('tampered-signature: flipped bit rejects', async () => {
    const parts = goldenVector.jws.split('.');
    const sigBytes = Buffer.from(parts[2], 'base64url');
    sigBytes[0] ^= 0x01;
    const tamperedJws = `${parts[0]}.${parts[1]}.${sigBytes.toString('base64url')}`;

    const result = await verify(tamperedJws, goldenPublicKey);
    expect(result.valid).toBe(false);
  });

  it('wrong-typ-header: rejected before signature check', async () => {
    const wrongHeader = { typ: 'wrong/0.1', alg: 'EdDSA', kid: 'golden-001' };
    const headerB64 = Buffer.from(JSON.stringify(wrongHeader)).toString('base64url');
    const parts = goldenVector.jws.split('.');
    const jws = `${headerB64}.${parts[1]}.${parts[2]}`;

    await expect(verify(jws, goldenPublicKey)).rejects.toThrow('Invalid typ');
  });

  it('wrong-alg-header: rejected before signature check', async () => {
    const wrongHeader = { typ: 'peac-receipt/0.1', alg: 'RS256', kid: 'golden-001' };
    const headerB64 = Buffer.from(JSON.stringify(wrongHeader)).toString('base64url');
    const parts = goldenVector.jws.split('.');
    const jws = `${headerB64}.${parts[1]}.${parts[2]}`;

    await expect(verify(jws, goldenPublicKey)).rejects.toThrow('Invalid alg');
  });

  it('malformed-jws: no dots rejected', async () => {
    await expect(verify('not-a-valid-jws', goldenPublicKey)).rejects.toThrow(
      'three dot-separated parts'
    );
  });
});
