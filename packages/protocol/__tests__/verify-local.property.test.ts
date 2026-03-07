/**
 * Property-based tests for verifyLocal() (DD-156, DD-158)
 *
 * Uses fast-check to verify invariants across generated inputs:
 * 1. verifyLocal() never throws for any JWS input: always returns VerifyLocalResult
 * 2. Valid receipts always verify: issue+verify roundtrip succeeds
 * 3. Result structure: valid === true iff variant/claims/warnings present
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { generateKeypair } from '@peac/crypto';
import { issueWire02, verifyLocal } from '../src/index';

// ---------------------------------------------------------------------------
// Shared keypair (generated once per suite)
// ---------------------------------------------------------------------------

let testKeypair: { privateKey: Uint8Array; publicKey: Uint8Array };

const testKid = '2026-03-07T00:00:00Z';
const testIss = 'https://api.example.com';
const testType = 'org.peacprotocol/commerce';

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

const validKind = fc.constantFrom('evidence' as const, 'challenge' as const);

const validType = fc
  .tuple(
    fc.constantFrom('org.peacprotocol', 'com.example', 'io.test'),
    fc.stringMatching(/^[a-z][a-z0-9_-]{0,15}$/)
  )
  .map(([domain, seg]) => `${domain}/${seg}`);

const validIss = fc
  .tuple(fc.stringMatching(/^[a-z][a-z0-9-]{0,15}$/), fc.constantFrom('.com', '.org', '.io'))
  .map(([host, tld]) => `https://${host}${tld}`);

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

import { beforeAll } from 'vitest';

beforeAll(async () => {
  testKeypair = await generateKeypair();
});

// ---------------------------------------------------------------------------
// Property 1: verifyLocal() is a total function (never throws)
// ---------------------------------------------------------------------------

describe('Property: verifyLocal() never throws', () => {
  it('random strings always return VerifyLocalResult', async () => {
    const values = fc.sample(fc.string({ maxLength: 500 }), 200);
    for (const jws of values) {
      const result = await verifyLocal(jws, testKeypair.publicKey);
      expect(typeof result.valid).toBe('boolean');
      if (!result.valid) {
        expect(typeof result.code).toBe('string');
        expect(result.code).toMatch(/^E_/);
        expect(typeof result.message).toBe('string');
      }
    }
  });

  it('random bytes as publicKey never cause unhandled errors', async () => {
    const { jws } = await issueWire02({
      iss: testIss,
      kind: 'evidence',
      type: testType,
      privateKey: testKeypair.privateKey,
      kid: testKid,
    });

    const keys = fc.sample(fc.uint8Array({ minLength: 32, maxLength: 32 }), 50);
    for (const key of keys) {
      const result = await verifyLocal(jws, key);
      expect(typeof result.valid).toBe('boolean');
    }
  });
});

// ---------------------------------------------------------------------------
// Property 2: Valid receipt roundtrip always succeeds
// ---------------------------------------------------------------------------

describe('Property: issue+verify roundtrip', () => {
  it('valid Wire 0.2 receipts always verify with matching key', async () => {
    // Generate multiple receipts with varying parameters
    const kinds = fc.sample(validKind, 50);
    const types = fc.sample(validType, 50);
    const issuers = fc.sample(validIss, 50);

    for (let i = 0; i < 50; i++) {
      const keypair = await generateKeypair();
      const { jws } = await issueWire02({
        iss: issuers[i],
        kind: kinds[i],
        type: types[i],
        privateKey: keypair.privateKey,
        kid: testKid,
      });

      const result = await verifyLocal(jws, keypair.publicKey);
      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.variant).toBe('wire-02');
        expect(result.wireVersion).toBe('0.2');
        expect(result.claims.kind).toBe(kinds[i]);
        expect(result.claims.iss).toBe(issuers[i]);
        expect(Array.isArray(result.warnings)).toBe(true);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Property 3: Result structure invariant
// ---------------------------------------------------------------------------

describe('Property: VerifyLocalResult structure', () => {
  it('valid=true always has variant, claims, warnings, policy_binding', async () => {
    for (let i = 0; i < 20; i++) {
      const keypair = await generateKeypair();
      const { jws } = await issueWire02({
        iss: testIss,
        kind: 'evidence',
        type: testType,
        privateKey: keypair.privateKey,
        kid: testKid,
      });

      const result = await verifyLocal(jws, keypair.publicKey);
      if (result.valid) {
        expect(result).toHaveProperty('variant', 'wire-02');
        expect(result).toHaveProperty('claims');
        expect(result).toHaveProperty('warnings');
        expect(result).toHaveProperty('policy_binding');
        expect(result).toHaveProperty('kid');
        expect(result).toHaveProperty('wireVersion', '0.2');
      }
    }
  });

  it('valid=false always has code and message', async () => {
    const values = fc.sample(fc.string({ maxLength: 200 }), 100);
    for (const jws of values) {
      const result = await verifyLocal(jws, testKeypair.publicKey);
      if (!result.valid) {
        expect(typeof result.code).toBe('string');
        expect(result.code).toMatch(/^E_/);
        expect(typeof result.message).toBe('string');
        expect(result.message.length).toBeGreaterThan(0);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Property 4: Wrong key always fails verification
// ---------------------------------------------------------------------------

describe('Property: wrong key always fails', () => {
  it('valid JWS with different key always returns valid=false', async () => {
    const { jws } = await issueWire02({
      iss: testIss,
      kind: 'evidence',
      type: testType,
      privateKey: testKeypair.privateKey,
      kid: testKid,
    });

    for (let i = 0; i < 30; i++) {
      const wrongKeypair = await generateKeypair();
      const result = await verifyLocal(jws, wrongKeypair.publicKey);
      expect(result.valid).toBe(false);
    }
  });
});
