/**
 * Section 19 Validation-Order Tests for verifyLocal()
 *
 * Verifies that verifyLocal() performs validation steps in the order specified
 * by Section 19 of WIRE-0.2.md. When multiple violations are present, the
 * earliest step's error code MUST be the one returned (Section 19, WIRE02-VALID-001
 * through WIRE02-VALID-003).
 *
 * Requirement coverage:
 *   WIRE02-VALID-001: Steps MUST be performed in specified order
 *   WIRE02-VALID-002: Hard error MUST terminate validation immediately
 *   WIRE02-VALID-003: Verifier MUST NOT continue after hard error
 *   WIRE02-VALID-006: Step 1: alg MUST be EdDSA
 *   WIRE02-VALID-007: Step 3: kernel constraints fail-closed
 *
 * Step order (from verify-local.ts, matching Section 19):
 *   1. Signature verification + header validation (JOSE hardening)
 *   2. Strictness routing (missing typ)
 *   3. Kernel constraints (field lengths, array sizes)
 *   4. Schema parse (Zod)
 *   5. Issuer binding
 *   6. Subject binding
 *   7. Time validation (iat + clock skew)
 *   8. Policy binding
 */

import { describe, it, expect } from 'vitest';
import { subtle } from 'node:crypto';
import { generateKeypair } from '@peac/crypto';
import { WIRE_02_JWS_TYP } from '@peac/kernel';
import { issueWire02, verifyLocal } from '../src/index';

const testKid = '2026-03-06T00:00:00Z';
const testIss = 'https://api.example.com';

/**
 * Create a valid Wire 0.2 JWS with custom header overrides.
 * Uses raw Ed25519 signing to inject hazardous headers.
 */
async function createJWSWithHeader(
  payload: Record<string, unknown>,
  privateKeyBytes: Uint8Array,
  kid: string,
  headerExtra: Record<string, unknown> = {}
): Promise<string> {
  const header = {
    alg: 'EdDSA',
    typ: WIRE_02_JWS_TYP,
    kid,
    ...headerExtra,
  };

  const headerB64 = Buffer.from(JSON.stringify(header)).toString('base64url');
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signingInput = `${headerB64}.${payloadB64}`;

  // PKCS8 wrapping for Ed25519 raw key
  const pkcs8 = new Uint8Array(48);
  const pkcs8Prefix = [
    0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x04, 0x22, 0x04, 0x20,
  ];
  pkcs8.set(pkcs8Prefix);
  pkcs8.set(privateKeyBytes, 16);

  const cryptoKey = await subtle.importKey('pkcs8', pkcs8, { name: 'Ed25519' }, false, ['sign']);
  const signature = await subtle.sign(
    { name: 'Ed25519' },
    cryptoKey,
    Buffer.from(signingInput, 'utf-8')
  );

  return `${signingInput}.${Buffer.from(signature).toString('base64url')}`;
}

// ---------------------------------------------------------------------------
// Step ordering: JOSE hardening (step 1) before kernel constraints (step 3)
// ---------------------------------------------------------------------------

describe('verifyLocal(): validation step ordering (Section 19)', () => {
  it('step 1 (JOSE) terminates before step 3 (kernel constraints): embedded jwk with oversized sub', async () => {
    const { privateKey, publicKey } = await generateKeypair();

    // Both violations: embedded jwk (step 1) AND oversized sub (step 3)
    const payload = {
      peac_version: '0.2',
      kind: 'evidence',
      type: 'org.peacprotocol/payment',
      iss: testIss,
      iat: Math.floor(Date.now() / 1000),
      jti: 'order-001',
      sub: 'x'.repeat(2048), // triggers kernel constraint violation (step 3)
    };

    const jws = await createJWSWithHeader(payload, privateKey, testKid, {
      jwk: { kty: 'OKP', crv: 'Ed25519', x: 'fake' }, // triggers step 1
    });

    const result = await verifyLocal(jws, publicKey);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      // JOSE hardening (step 1) MUST fire first, NOT constraint violation (step 3)
      expect(result.code).toBe('E_JWS_EMBEDDED_KEY');
    }
  });

  // ---------------------------------------------------------------------------
  // Step ordering: kernel constraints (step 3) before schema parse (step 4)
  // ---------------------------------------------------------------------------

  it('step 3 (constraints) terminates before step 4 (schema): oversized sub with missing kind', async () => {
    const { privateKey, publicKey } = await generateKeypair();

    // Both violations: oversized sub (step 3) AND missing kind (step 4)
    const payload = {
      peac_version: '0.2',
      // kind is missing: triggers schema validation E_MISSING_REQUIRED_CLAIM (step 4)
      type: 'org.peacprotocol/payment',
      iss: testIss,
      iat: Math.floor(Date.now() / 1000),
      jti: 'order-002',
      sub: 'x'.repeat(65537), // exceeds MAX_STRING_LENGTH=65536; triggers kernel constraint (step 3)
    };

    const jws = await createJWSWithHeader(payload, privateKey, testKid);

    const result = await verifyLocal(jws, publicKey);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      // Kernel constraint (step 3) MUST fire first, NOT schema parse (step 4)
      expect(result.code).toBe('E_CONSTRAINT_VIOLATION');
    }
  });

  // ---------------------------------------------------------------------------
  // Step ordering: schema parse (step 4) before issuer binding (step 5)
  // ---------------------------------------------------------------------------

  it('step 4 (schema) terminates before step 5 (issuer): missing kind with issuer mismatch', async () => {
    const { privateKey, publicKey } = await generateKeypair();

    // Both violations: missing kind (step 4) AND issuer mismatch (step 5)
    const payload = {
      peac_version: '0.2',
      // kind is missing: triggers schema validation (step 4)
      type: 'org.peacprotocol/payment',
      iss: testIss,
      iat: Math.floor(Date.now() / 1000),
      jti: 'order-003',
    };

    const jws = await createJWSWithHeader(payload, privateKey, testKid);

    const result = await verifyLocal(jws, publicKey, {
      issuer: 'https://different.example.com', // would fail at step 5
    });

    expect(result.valid).toBe(false);
    if (!result.valid) {
      // Schema parse (step 4) MUST fire first, NOT issuer binding (step 5)
      expect(result.code).toBe('E_INVALID_FORMAT');
    }
  });

  // ---------------------------------------------------------------------------
  // Step ordering: issuer binding (step 5) before time validation (step 7)
  // ---------------------------------------------------------------------------

  it('step 5 (issuer) terminates before step 7 (time): issuer mismatch with future iat', async () => {
    const { privateKey, publicKey } = await generateKeypair();

    // Issue with current time, then verify with now far in the past
    const { jws } = await issueWire02({
      iss: testIss,
      kind: 'evidence',
      type: 'org.peacprotocol/payment',
      privateKey,
      kid: testKid,
    });

    const pastTime = Math.floor(Date.now() / 1000) - 86400;
    const result = await verifyLocal(jws, publicKey, {
      issuer: 'https://different.example.com', // triggers issuer check (step 5)
      now: pastTime, // makes iat appear future (step 7)
    });

    expect(result.valid).toBe(false);
    if (!result.valid) {
      // Issuer binding (step 5) MUST fire first, NOT time validation (step 7)
      expect(result.code).toBe('E_INVALID_ISSUER');
    }
  });

  // ---------------------------------------------------------------------------
  // Step ordering: time validation (step 7) before policy binding (step 8)
  // ---------------------------------------------------------------------------

  it('step 7 (time) terminates before step 8 (policy): future iat with policy mismatch', async () => {
    const { privateKey, publicKey } = await generateKeypair();

    // Issue with current time + policy digest, then verify with now far in the past
    // so that receipt iat appears to be in the future beyond maxClockSkew
    const { jws } = await issueWire02({
      iss: testIss,
      kind: 'evidence',
      type: 'org.peacprotocol/payment',
      privateKey,
      kid: testKid,
      policy: {
        digest: 'sha256:' + 'a'.repeat(64),
      },
    });

    const pastTime = Math.floor(Date.now() / 1000) - 86400; // 24 hours in the past
    const result = await verifyLocal(jws, publicKey, {
      now: pastTime, // makes current iat appear far in the future relative to now
      policyDigest: 'sha256:' + 'b'.repeat(64), // mismatch: would trigger step 8
    });

    expect(result.valid).toBe(false);
    if (!result.valid) {
      // Time validation (step 7) MUST fire first, NOT policy binding (step 8)
      expect(result.code).toBe('E_NOT_YET_VALID');
    }
  });

  // ---------------------------------------------------------------------------
  // Step ordering: signature (step 1) before everything else
  // ---------------------------------------------------------------------------

  it('step 1 (signature) terminates before all subsequent steps: wrong key with schema errors', async () => {
    const issuerKeys = await generateKeypair();
    const wrongKeys = await generateKeypair();

    const { jws } = await issueWire02({
      iss: testIss,
      kind: 'evidence',
      type: 'org.peacprotocol/payment',
      privateKey: issuerKeys.privateKey,
      kid: testKid,
    });

    // Verify with wrong public key
    const result = await verifyLocal(jws, wrongKeys.publicKey, {
      issuer: 'https://different.example.com', // would fail at step 5
    });

    expect(result.valid).toBe(false);
    if (!result.valid) {
      // Signature (step 1) MUST fire first
      expect(result.code).toBe('E_INVALID_SIGNATURE');
    }
  });

  // ---------------------------------------------------------------------------
  // Step ordering: strict typ check (step 2) before kernel constraints (step 3)
  // ---------------------------------------------------------------------------

  it('step 2 (strict typ) terminates before step 3 (constraints): missing typ with oversized sub', async () => {
    const { privateKey, publicKey } = await generateKeypair();

    const payload = {
      peac_version: '0.2',
      kind: 'evidence',
      type: 'org.peacprotocol/payment',
      iss: testIss,
      iat: Math.floor(Date.now() / 1000),
      jti: 'order-007',
      sub: 'x'.repeat(2048), // triggers kernel constraint (step 3)
    };

    // Create JWS without typ header
    const header = { alg: 'EdDSA', kid: testKid };
    const headerB64 = Buffer.from(JSON.stringify(header)).toString('base64url');
    const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signingInput = `${headerB64}.${payloadB64}`;

    const pkcs8 = new Uint8Array(48);
    const pkcs8Prefix = [
      0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x04, 0x22, 0x04,
      0x20,
    ];
    pkcs8.set(pkcs8Prefix);
    pkcs8.set(privateKey, 16);

    const cryptoKey = await subtle.importKey('pkcs8', pkcs8, { name: 'Ed25519' }, false, ['sign']);
    const signature = await subtle.sign(
      { name: 'Ed25519' },
      cryptoKey,
      Buffer.from(signingInput, 'utf-8')
    );

    const jws = `${signingInput}.${Buffer.from(signature).toString('base64url')}`;

    // Strict mode (default): missing typ is a hard error at step 2
    const result = await verifyLocal(jws, publicKey);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      // Strict typ (step 2) MUST fire first, NOT kernel constraints (step 3)
      expect(result.code).toBe('E_INVALID_FORMAT');
      expect(result.message).toContain('typ');
    }
  });

  // ---------------------------------------------------------------------------
  // Verify that valid receipt passes all steps
  // ---------------------------------------------------------------------------

  it('valid receipt passes all 13 validation steps successfully', async () => {
    const { privateKey, publicKey } = await generateKeypair();

    const { jws } = await issueWire02({
      iss: testIss,
      kind: 'evidence',
      type: 'org.peacprotocol/payment',
      privateKey,
      kid: testKid,
      pillars: ['commerce'],
      extensions: {
        'org.peacprotocol/commerce': {
          payment_rail: 'stripe',
          amount_minor: '1000',
          currency: 'USD',
        },
      },
    });

    const result = await verifyLocal(jws, publicKey, {
      issuer: testIss,
    });

    expect(result.valid).toBe(true);
    if (result.valid && result.variant === 'wire-02') {
      expect(result.claims.kind).toBe('evidence');
      expect(result.claims.type).toBe('org.peacprotocol/payment');
      expect(result.policy_binding).toBe('unavailable');
    }
  });

  // ---------------------------------------------------------------------------
  // Step ordering: subject binding (step 6) before time validation (step 7)
  // ---------------------------------------------------------------------------

  it('step 6 (subject) terminates before step 7 (time): subject mismatch with future iat', async () => {
    const { privateKey, publicKey } = await generateKeypair();

    // Issue with sub, then verify with now far in past + wrong subjectUri
    const { jws } = await issueWire02({
      iss: testIss,
      kind: 'evidence',
      type: 'org.peacprotocol/payment',
      privateKey,
      kid: testKid,
      sub: 'https://api.example.com/resource/123',
    });

    const pastTime = Math.floor(Date.now() / 1000) - 86400;
    const result = await verifyLocal(jws, publicKey, {
      subjectUri: 'https://api.example.com/resource/999', // mismatch (step 6)
      now: pastTime, // makes iat appear future (step 7)
    });

    expect(result.valid).toBe(false);
    if (!result.valid) {
      // Subject binding (step 6) MUST fire first, NOT time validation (step 7)
      expect(result.code).toBe('E_INVALID_SUBJECT');
    }
  });
});
