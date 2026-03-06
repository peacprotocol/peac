/**
 * Tests for verifyLocal (Wire 0.2 only) and verifyLocalWire01 (Wire 0.1)
 *
 * verifyLocal() is Wire 0.2 only as of v0.12.0-preview.2.
 * Wire 0.1 receipts return E_UNSUPPORTED_WIRE_VERSION.
 * Wire 0.1 verification uses verifyLocalWire01() (internal, not barrel-exported).
 */

import { describe, it, expect } from 'vitest';
import { generateKeypair, sign, base64urlEncodeString, base64urlEncode } from '@peac/crypto';
import { issue } from '../src/issue';
import { verifyLocal } from '../src/verify-local';
import { verifyLocalWire01 } from '../src/verify-local-wire01';

// ---------------------------------------------------------------------------
// verifyLocal(): Wire 0.1 rejection (E_UNSUPPORTED_WIRE_VERSION)
// ---------------------------------------------------------------------------

describe('verifyLocal(): Wire 0.1 rejection', () => {
  it('returns E_UNSUPPORTED_WIRE_VERSION for Wire 0.1 commerce receipt', async () => {
    const { privateKey, publicKey } = await generateKeypair();
    const { jws } = await issue({
      iss: 'https://api.example.com',
      aud: 'https://client.example.com',
      amt: 1000,
      cur: 'USD',
      rail: 'x402',
      reference: 'tx_abc123',
      asset: 'USD',
      env: 'test',
      evidence: {},
      privateKey,
      kid: 'key-2026-01',
    });

    const result = await verifyLocal(jws, publicKey);

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.code).toBe('E_UNSUPPORTED_WIRE_VERSION');
      expect(result.message).toContain('Wire 0.1');
    }
  });

  it('returns E_UNSUPPORTED_WIRE_VERSION for Wire 0.1 attestation receipt', async () => {
    const { privateKey, publicKey } = await generateKeypair();
    const now = Math.floor(Date.now() / 1000);
    const jws = await sign(
      {
        iss: 'https://middleware.example.com',
        aud: 'https://api.example.com',
        iat: now,
        exp: now + 3600,
        rid: '01234567-0123-7123-8123-0123456789ab',
        sub: 'https://api.example.com/v1/chat',
      },
      privateKey,
      'key-2026-01'
    );

    const result = await verifyLocal(jws, publicKey);

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.code).toBe('E_UNSUPPORTED_WIRE_VERSION');
    }
  });

  it('returns E_UNSUPPORTED_WIRE_VERSION for manually signed Wire 0.1 JWS', async () => {
    const { privateKey, publicKey } = await generateKeypair();
    const payload = {
      iss: 'https://api.example.com',
      aud: 'https://client.example.com',
      iat: Math.floor(Date.now() / 1000),
      rid: '01234567-0123-7123-8123-0123456789ab',
      amt: 1000,
      cur: 'USD',
      payment: { rail: 'x402', reference: 'tx_001', amount: 1000, currency: 'USD' },
    };
    const jws = await sign(payload, privateKey, 'key-01');

    const result = await verifyLocal(jws, publicKey);

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.code).toBe('E_UNSUPPORTED_WIRE_VERSION');
    }
  });
});

// ---------------------------------------------------------------------------
// verifyLocalWire01(): Wire 0.1 verification (extracted, internal-only)
// ---------------------------------------------------------------------------

describe('verifyLocalWire01', () => {
  describe('successful verification', () => {
    it('verifies a valid receipt', async () => {
      const { privateKey, publicKey } = await generateKeypair();

      const { jws } = await issue({
        iss: 'https://api.example.com',
        aud: 'https://client.example.com',
        amt: 1000,
        cur: 'USD',
        rail: 'x402',
        reference: 'tx_abc123',
        asset: 'USD',
        env: 'test',
        evidence: { txId: 'tx_abc123' },
        privateKey,
        kid: 'key-2026-01',
      });

      const result = await verifyLocalWire01(jws, publicKey);

      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.variant).toBe('commerce');
        if (result.variant === 'commerce') {
          expect(result.claims.iss).toBe('https://api.example.com');
          expect(result.claims.aud).toBe('https://client.example.com');
          expect(result.claims.amt).toBe(1000);
          expect(result.claims.cur).toBe('USD');
          expect(result.claims.payment.rail).toBe('x402');
          expect(result.claims.payment.reference).toBe('tx_abc123');
        }
      }
    });

    it('verifies with issuer binding', async () => {
      const { privateKey, publicKey } = await generateKeypair();

      const { jws } = await issue({
        iss: 'https://api.example.com',
        aud: 'https://client.example.com',
        amt: 1000,
        cur: 'USD',
        rail: 'x402',
        reference: 'tx_abc123',
        asset: 'USD',
        env: 'test',
        evidence: {},
        privateKey,
        kid: 'key-2026-01',
      });

      const result = await verifyLocalWire01(jws, publicKey, {
        issuer: 'https://api.example.com',
      });

      expect(result.valid).toBe(true);
    });

    it('verifies with audience binding', async () => {
      const { privateKey, publicKey } = await generateKeypair();

      const { jws } = await issue({
        iss: 'https://api.example.com',
        aud: 'https://client.example.com',
        amt: 1000,
        cur: 'USD',
        rail: 'x402',
        reference: 'tx_abc123',
        asset: 'USD',
        env: 'test',
        evidence: {},
        privateKey,
        kid: 'key-2026-01',
      });

      const result = await verifyLocalWire01(jws, publicKey, {
        audience: 'https://client.example.com',
      });

      expect(result.valid).toBe(true);
    });

    it('verifies with both issuer and audience binding', async () => {
      const { privateKey, publicKey } = await generateKeypair();

      const { jws } = await issue({
        iss: 'https://api.example.com',
        aud: 'https://client.example.com',
        amt: 1000,
        cur: 'USD',
        rail: 'x402',
        reference: 'tx_abc123',
        asset: 'USD',
        env: 'test',
        evidence: {},
        privateKey,
        kid: 'key-2026-01',
      });

      const result = await verifyLocalWire01(jws, publicKey, {
        issuer: 'https://api.example.com',
        audience: 'https://client.example.com',
      });

      expect(result.valid).toBe(true);
    });
  });

  describe('signature validation', () => {
    it('returns E_INVALID_SIGNATURE for wrong public key', async () => {
      const { privateKey } = await generateKeypair();
      const { publicKey: wrongKey } = await generateKeypair();

      const { jws } = await issue({
        iss: 'https://api.example.com',
        aud: 'https://client.example.com',
        amt: 1000,
        cur: 'USD',
        rail: 'x402',
        reference: 'tx_abc123',
        asset: 'USD',
        env: 'test',
        evidence: {},
        privateKey,
        kid: 'key-2026-01',
      });

      const result = await verifyLocalWire01(jws, wrongKey);

      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.code).toBe('E_INVALID_SIGNATURE');
      }
    });

    it('returns E_INVALID_FORMAT for malformed JWS', async () => {
      const { publicKey } = await generateKeypair();

      const result = await verifyLocalWire01('not-a-valid-jws', publicKey);

      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.code).toBe('E_INVALID_FORMAT');
      }
    });
  });

  describe('schema validation', () => {
    it('returns E_INVALID_FORMAT for invalid payload', async () => {
      const { privateKey, publicKey } = await generateKeypair();

      const invalidPayload = { foo: 'bar' };
      const jws = await sign(invalidPayload, privateKey, 'key-2026-01');

      const result = await verifyLocalWire01(jws, publicKey);

      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.code).toBe('E_INVALID_FORMAT');
        expect(result.message).toContain('Receipt schema validation failed');
      }
    });
  });

  describe('binding validation', () => {
    it('returns E_INVALID_ISSUER for issuer mismatch', async () => {
      const { privateKey, publicKey } = await generateKeypair();

      const { jws } = await issue({
        iss: 'https://api.example.com',
        aud: 'https://client.example.com',
        amt: 1000,
        cur: 'USD',
        rail: 'x402',
        reference: 'tx_abc123',
        asset: 'USD',
        env: 'test',
        evidence: {},
        privateKey,
        kid: 'key-2026-01',
      });

      const result = await verifyLocalWire01(jws, publicKey, {
        issuer: 'https://other.example.com',
      });

      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.code).toBe('E_INVALID_ISSUER');
        expect(result.message).toContain('Issuer mismatch');
      }
    });

    it('returns E_INVALID_AUDIENCE for audience mismatch', async () => {
      const { privateKey, publicKey } = await generateKeypair();

      const { jws } = await issue({
        iss: 'https://api.example.com',
        aud: 'https://client.example.com',
        amt: 1000,
        cur: 'USD',
        rail: 'x402',
        reference: 'tx_abc123',
        asset: 'USD',
        env: 'test',
        evidence: {},
        privateKey,
        kid: 'key-2026-01',
      });

      const result = await verifyLocalWire01(jws, publicKey, {
        audience: 'https://other.example.com',
      });

      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.code).toBe('E_INVALID_AUDIENCE');
        expect(result.message).toContain('Audience mismatch');
      }
    });
  });

  describe('time validation', () => {
    it('returns E_EXPIRED for expired receipt', async () => {
      const { privateKey, publicKey } = await generateKeypair();
      const now = Math.floor(Date.now() / 1000);

      const { jws } = await issue({
        iss: 'https://api.example.com',
        aud: 'https://client.example.com',
        amt: 1000,
        cur: 'USD',
        rail: 'x402',
        reference: 'tx_abc123',
        asset: 'USD',
        env: 'test',
        evidence: {},
        exp: now - 3600,
        privateKey,
        kid: 'key-2026-01',
      });

      const result = await verifyLocalWire01(jws, publicKey);

      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.code).toBe('E_EXPIRED');
        expect(result.message).toContain('expired');
      }
    });

    it('accepts receipt within clock skew tolerance', async () => {
      const { privateKey, publicKey } = await generateKeypair();
      const now = Math.floor(Date.now() / 1000);

      const { jws } = await issue({
        iss: 'https://api.example.com',
        aud: 'https://client.example.com',
        amt: 1000,
        cur: 'USD',
        rail: 'x402',
        reference: 'tx_abc123',
        asset: 'USD',
        env: 'test',
        evidence: {},
        exp: now - 100,
        privateKey,
        kid: 'key-2026-01',
      });

      const result = await verifyLocalWire01(jws, publicKey);

      expect(result.valid).toBe(true);
    });

    it('returns E_NOT_YET_VALID for receipt issued in the future', async () => {
      const { privateKey, publicKey } = await generateKeypair();
      const now = Math.floor(Date.now() / 1000);
      const futureIat = now + 3600;

      const payload = {
        iss: 'https://api.example.com',
        aud: 'https://client.example.com',
        iat: futureIat,
        rid: '01234567-0123-7123-8123-0123456789ab',
        amt: 1000,
        cur: 'USD',
        payment: { rail: 'x402', reference: 'tx_abc123', amount: 1000, currency: 'USD' },
      };

      const jws = await sign(payload, privateKey, 'key-2026-01');
      const result = await verifyLocalWire01(jws, publicKey);

      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.code).toBe('E_NOT_YET_VALID');
        expect(result.message).toContain('not yet valid');
      }
    });

    it('accepts receipt with iat within clock skew tolerance', async () => {
      const { privateKey, publicKey } = await generateKeypair();
      const now = Math.floor(Date.now() / 1000);
      const futureIat = now + 100;

      const payload = {
        iss: 'https://api.example.com',
        aud: 'https://client.example.com',
        iat: futureIat,
        rid: '01234567-0123-7123-8123-0123456789ab',
        amt: 1000,
        cur: 'USD',
        payment: { rail: 'x402', reference: 'tx_abc123', amount: 1000, currency: 'USD' },
      };

      const jws = await sign(payload, privateKey, 'key-2026-01');
      const result = await verifyLocalWire01(jws, publicKey);

      expect(result.valid).toBe(true);
    });

    it('respects custom clock skew tolerance', async () => {
      const { privateKey, publicKey } = await generateKeypair();
      const now = Math.floor(Date.now() / 1000);

      const { jws } = await issue({
        iss: 'https://api.example.com',
        aud: 'https://client.example.com',
        amt: 1000,
        cur: 'USD',
        rail: 'x402',
        reference: 'tx_abc123',
        asset: 'USD',
        env: 'test',
        evidence: {},
        exp: now - 100,
        privateKey,
        kid: 'key-2026-01',
      });

      const result = await verifyLocalWire01(jws, publicKey, { maxClockSkew: 0 });

      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.code).toBe('E_EXPIRED');
      }
    });

    it('respects custom now timestamp', async () => {
      const { privateKey, publicKey } = await generateKeypair();
      const now = Math.floor(Date.now() / 1000);

      const { jws } = await issue({
        iss: 'https://api.example.com',
        aud: 'https://client.example.com',
        amt: 1000,
        cur: 'USD',
        rail: 'x402',
        reference: 'tx_abc123',
        asset: 'USD',
        env: 'test',
        evidence: {},
        exp: now + 3600,
        privateKey,
        kid: 'key-2026-01',
      });

      const futureNow = now + 7200;
      const result = await verifyLocalWire01(jws, publicKey, { now: futureNow, maxClockSkew: 0 });

      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.code).toBe('E_EXPIRED');
      }
    });
  });

  describe('return type', () => {
    it('returns schema-derived type for claims', async () => {
      const { privateKey, publicKey } = await generateKeypair();

      const { jws } = await issue({
        iss: 'https://api.example.com',
        aud: 'https://client.example.com',
        amt: 1000,
        cur: 'USD',
        rail: 'x402',
        reference: 'tx_abc123',
        asset: 'USD',
        env: 'test',
        evidence: { txId: 'tx_abc123' },
        subject: 'https://api.example.com/resource',
        privateKey,
        kid: 'key-2026-01',
      });

      const result = await verifyLocalWire01(jws, publicKey);

      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.variant).toBe('commerce');
        if (result.variant === 'commerce') {
          expect(typeof result.claims.iss).toBe('string');
          expect(typeof result.claims.aud).toBe('string');
          expect(typeof result.claims.iat).toBe('number');
          expect(typeof result.claims.rid).toBe('string');
          expect(typeof result.claims.amt).toBe('number');
          expect(typeof result.claims.cur).toBe('string');
          expect(typeof result.claims.payment).toBe('object');
          expect(result.claims.subject?.uri).toBe('https://api.example.com/resource');
        }
      }
    });

    it('includes kid in success response', async () => {
      const { privateKey, publicKey } = await generateKeypair();

      const { jws } = await issue({
        iss: 'https://api.example.com',
        aud: 'https://client.example.com',
        amt: 1000,
        cur: 'USD',
        rail: 'x402',
        reference: 'tx_abc123',
        asset: 'USD',
        env: 'test',
        evidence: {},
        privateKey,
        kid: 'signing-key-2026-01',
      });

      const result = await verifyLocalWire01(jws, publicKey);

      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.kid).toBe('signing-key-2026-01');
      }
    });
  });

  describe('subject binding', () => {
    it('verifies with subject binding', async () => {
      const { privateKey, publicKey } = await generateKeypair();

      const { jws } = await issue({
        iss: 'https://api.example.com',
        aud: 'https://client.example.com',
        amt: 1000,
        cur: 'USD',
        rail: 'x402',
        reference: 'tx_abc123',
        asset: 'USD',
        env: 'test',
        evidence: {},
        subject: 'https://api.example.com/inference/v1',
        privateKey,
        kid: 'key-2026-01',
      });

      const result = await verifyLocalWire01(jws, publicKey, {
        subjectUri: 'https://api.example.com/inference/v1',
      });

      expect(result.valid).toBe(true);
    });

    it('returns E_INVALID_SUBJECT for subject mismatch', async () => {
      const { privateKey, publicKey } = await generateKeypair();

      const { jws } = await issue({
        iss: 'https://api.example.com',
        aud: 'https://client.example.com',
        amt: 1000,
        cur: 'USD',
        rail: 'x402',
        reference: 'tx_abc123',
        asset: 'USD',
        env: 'test',
        evidence: {},
        subject: 'https://api.example.com/inference/v1',
        privateKey,
        kid: 'key-2026-01',
      });

      const result = await verifyLocalWire01(jws, publicKey, {
        subjectUri: 'https://api.example.com/different-endpoint',
      });

      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.code).toBe('E_INVALID_SUBJECT');
        expect(result.message).toContain('Subject mismatch');
      }
    });

    it('returns E_INVALID_SUBJECT when subject expected but missing', async () => {
      const { privateKey, publicKey } = await generateKeypair();

      const { jws } = await issue({
        iss: 'https://api.example.com',
        aud: 'https://client.example.com',
        amt: 1000,
        cur: 'USD',
        rail: 'x402',
        reference: 'tx_abc123',
        asset: 'USD',
        env: 'test',
        evidence: {},
        privateKey,
        kid: 'key-2026-01',
      });

      const result = await verifyLocalWire01(jws, publicKey, {
        subjectUri: 'https://api.example.com/inference/v1',
      });

      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.code).toBe('E_INVALID_SUBJECT');
        expect(result.message).toContain('undefined');
      }
    });
  });

  describe('receipt ID binding', () => {
    it('verifies with rid binding', async () => {
      const { privateKey, publicKey } = await generateKeypair();

      const { jws } = await issue({
        iss: 'https://api.example.com',
        aud: 'https://client.example.com',
        amt: 1000,
        cur: 'USD',
        rail: 'x402',
        reference: 'tx_abc123',
        asset: 'USD',
        env: 'test',
        evidence: {},
        privateKey,
        kid: 'key-2026-01',
      });

      const preCheck = await verifyLocalWire01(jws, publicKey);
      expect(preCheck.valid).toBe(true);
      if (!preCheck.valid) return;

      const rid = (preCheck.claims as { rid: string }).rid;
      const result = await verifyLocalWire01(jws, publicKey, { rid });

      expect(result.valid).toBe(true);
    });

    it('returns E_INVALID_RECEIPT_ID for rid mismatch', async () => {
      const { privateKey, publicKey } = await generateKeypair();

      const { jws } = await issue({
        iss: 'https://api.example.com',
        aud: 'https://client.example.com',
        amt: 1000,
        cur: 'USD',
        rail: 'x402',
        reference: 'tx_abc123',
        asset: 'USD',
        env: 'test',
        evidence: {},
        privateKey,
        kid: 'key-2026-01',
      });

      const result = await verifyLocalWire01(jws, publicKey, {
        rid: '00000000-0000-7000-8000-000000000000',
      });

      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.code).toBe('E_INVALID_RECEIPT_ID');
        expect(result.message).toContain('Receipt ID mismatch');
      }
    });
  });

  describe('requireExp option', () => {
    it('accepts receipt without exp when requireExp is false', async () => {
      const { privateKey, publicKey } = await generateKeypair();

      const { jws } = await issue({
        iss: 'https://api.example.com',
        aud: 'https://client.example.com',
        amt: 1000,
        cur: 'USD',
        rail: 'x402',
        reference: 'tx_abc123',
        asset: 'USD',
        env: 'test',
        evidence: {},
        privateKey,
        kid: 'key-2026-01',
      });

      const result = await verifyLocalWire01(jws, publicKey, { requireExp: false });
      expect(result.valid).toBe(true);
    });

    it('accepts receipt without exp by default', async () => {
      const { privateKey, publicKey } = await generateKeypair();

      const { jws } = await issue({
        iss: 'https://api.example.com',
        aud: 'https://client.example.com',
        amt: 1000,
        cur: 'USD',
        rail: 'x402',
        reference: 'tx_abc123',
        asset: 'USD',
        env: 'test',
        evidence: {},
        privateKey,
        kid: 'key-2026-01',
      });

      const result = await verifyLocalWire01(jws, publicKey);
      expect(result.valid).toBe(true);
    });

    it('rejects receipt without exp when requireExp is true', async () => {
      const { privateKey, publicKey } = await generateKeypair();

      const { jws } = await issue({
        iss: 'https://api.example.com',
        aud: 'https://client.example.com',
        amt: 1000,
        cur: 'USD',
        rail: 'x402',
        reference: 'tx_abc123',
        asset: 'USD',
        env: 'test',
        evidence: {},
        privateKey,
        kid: 'key-2026-01',
      });

      const result = await verifyLocalWire01(jws, publicKey, { requireExp: true });

      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.code).toBe('E_MISSING_EXP');
        expect(result.message).toContain('missing required exp claim');
      }
    });

    it('accepts receipt with exp when requireExp is true', async () => {
      const { privateKey, publicKey } = await generateKeypair();
      const now = Math.floor(Date.now() / 1000);

      const { jws } = await issue({
        iss: 'https://api.example.com',
        aud: 'https://client.example.com',
        amt: 1000,
        cur: 'USD',
        rail: 'x402',
        reference: 'tx_abc123',
        asset: 'USD',
        env: 'test',
        evidence: {},
        exp: now + 3600,
        privateKey,
        kid: 'key-2026-01',
      });

      const result = await verifyLocalWire01(jws, publicKey, { requireExp: true });
      expect(result.valid).toBe(true);
    });
  });

  describe('attestation receipt verification', () => {
    it('verifies an attestation receipt with variant=attestation', async () => {
      const { privateKey, publicKey } = await generateKeypair();
      const now = Math.floor(Date.now() / 1000);

      const attestationPayload = {
        iss: 'https://middleware.example.com',
        aud: 'https://api.example.com',
        iat: now,
        exp: now + 3600,
        rid: '01234567-0123-7123-8123-0123456789ab',
      };

      const jws = await sign(attestationPayload, privateKey, 'key-2026-01');
      const result = await verifyLocalWire01(jws, publicKey);

      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.variant).toBe('attestation');
        expect(result.claims.iss).toBe('https://middleware.example.com');
        expect(result.claims.aud).toBe('https://api.example.com');
        expect(typeof result.claims.iat).toBe('number');
        expect(result.kid).toBe('key-2026-01');
      }
    });

    it('supports issuer binding on attestation receipts', async () => {
      const { privateKey, publicKey } = await generateKeypair();
      const now = Math.floor(Date.now() / 1000);

      const attestationPayload = {
        iss: 'https://middleware.example.com',
        aud: 'https://api.example.com',
        iat: now,
        exp: now + 3600,
        rid: '01234567-0123-7123-8123-0123456789ab',
      };

      const jws = await sign(attestationPayload, privateKey, 'key-2026-01');
      const result = await verifyLocalWire01(jws, publicKey, {
        issuer: 'https://middleware.example.com',
      });

      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.variant).toBe('attestation');
      }
    });

    it('returns E_INVALID_FORMAT with details for invalid attestation payload', async () => {
      const { privateKey, publicKey } = await generateKeypair();

      const invalidPayload = { iss: 'https://example.com' };
      const jws = await sign(invalidPayload, privateKey, 'key-2026-01');

      const result = await verifyLocalWire01(jws, publicKey);

      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.code).toBe('E_INVALID_FORMAT');
        expect(result.details).toBeDefined();
        expect(result.details?.parse_code).toBe('E_PARSE_ATTESTATION_INVALID');
      }
    });

    it('details.issues is a bounded array of {path, message} objects', async () => {
      const { privateKey, publicKey } = await generateKeypair();
      const now = Math.floor(Date.now() / 1000);

      const invalidPayload = {
        iss: 'https://example.com',
        aud: 'https://api.example.com',
        iat: now,
        rid: '01234567-0123-7123-8123-0123456789ab',
        amt: 1000,
      };
      const jws = await sign(invalidPayload, privateKey, 'key-2026-01');

      const result = await verifyLocalWire01(jws, publicKey);

      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.code).toBe('E_INVALID_FORMAT');
        expect(result.details?.parse_code).toBe('E_PARSE_COMMERCE_INVALID');
        expect(result.details?.issues).toBeDefined();
        expect(Array.isArray(result.details?.issues)).toBe(true);
        expect(result.details!.issues!.length).toBeGreaterThan(0);
        expect(result.details!.issues!.length).toBeLessThanOrEqual(25);
        for (const issue of result.details!.issues!) {
          expect(typeof issue.path).toBe('string');
          expect(typeof issue.message).toBe('string');
          expect(Object.keys(issue)).toEqual(['path', 'message']);
        }
      }
    });
  });

  describe('SyntaxError -> E_INVALID_FORMAT mapping', () => {
    it('returns E_INVALID_FORMAT for JWS with invalid JSON payload', async () => {
      const { publicKey } = await generateKeypair();

      const header = base64urlEncodeString(
        JSON.stringify({ typ: 'peac-receipt/0.1', alg: 'EdDSA', kid: 'test-key' })
      );
      const invalidPayload = base64urlEncodeString('not valid json {{{');
      const fakeSig = base64urlEncode(new Uint8Array(64));

      const malformedJws = `${header}.${invalidPayload}.${fakeSig}`;
      const result = await verifyLocalWire01(malformedJws, publicKey);

      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.code).toBe('E_INVALID_FORMAT');
      }
    });
  });
});
