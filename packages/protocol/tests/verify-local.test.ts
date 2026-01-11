/**
 * Tests for verifyLocal - typed local receipt verification
 */

import { describe, it, expect } from 'vitest';
import { generateKeypair, sign } from '@peac/crypto';
import { issue } from '../src/issue';
import { verifyLocal } from '../src/verify-local';

describe('verifyLocal', () => {
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

      const result = await verifyLocal(jws, publicKey);

      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.claims.iss).toBe('https://api.example.com');
        expect(result.claims.aud).toBe('https://client.example.com');
        expect(result.claims.amt).toBe(1000);
        expect(result.claims.cur).toBe('USD');
        expect(result.claims.payment.rail).toBe('x402');
        expect(result.claims.payment.reference).toBe('tx_abc123');
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

      const result = await verifyLocal(jws, publicKey, {
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

      const result = await verifyLocal(jws, publicKey, {
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

      const result = await verifyLocal(jws, publicKey, {
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

      const result = await verifyLocal(jws, wrongKey);

      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.code).toBe('E_INVALID_SIGNATURE');
      }
    });

    it('returns E_INVALID_FORMAT for malformed JWS', async () => {
      const { publicKey } = await generateKeypair();

      const result = await verifyLocal('not-a-valid-jws', publicKey);

      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.code).toBe('E_INVALID_FORMAT');
      }
    });
  });

  describe('schema validation', () => {
    it('returns E_INVALID_FORMAT for invalid payload', async () => {
      const { privateKey, publicKey } = await generateKeypair();

      // Sign invalid payload (missing required fields)
      const invalidPayload = { foo: 'bar' };
      const jws = await sign(invalidPayload, privateKey, 'key-2026-01');

      const result = await verifyLocal(jws, publicKey);

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

      const result = await verifyLocal(jws, publicKey, {
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

      const result = await verifyLocal(jws, publicKey, {
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
        exp: now - 3600, // Expired 1 hour ago
        privateKey,
        kid: 'key-2026-01',
      });

      const result = await verifyLocal(jws, publicKey);

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
        exp: now - 100, // Expired 100 seconds ago, within default 300s skew
        privateKey,
        kid: 'key-2026-01',
      });

      const result = await verifyLocal(jws, publicKey);

      expect(result.valid).toBe(true);
    });

    it('returns E_NOT_YET_VALID for receipt issued in the future', async () => {
      const { privateKey, publicKey } = await generateKeypair();
      const now = Math.floor(Date.now() / 1000);
      const futureIat = now + 3600; // 1 hour in the future

      // Create a JWS with future iat manually (issue() uses current time)
      const payload = {
        iss: 'https://api.example.com',
        aud: 'https://client.example.com',
        iat: futureIat,
        rid: '01234567-0123-7123-8123-0123456789ab',
        amt: 1000,
        cur: 'USD',
        payment: {
          rail: 'x402',
          reference: 'tx_abc123',
          amount: 1000,
          currency: 'USD',
        },
      };

      const jws = await sign(payload, privateKey, 'key-2026-01');

      const result = await verifyLocal(jws, publicKey);

      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.code).toBe('E_NOT_YET_VALID');
        expect(result.message).toContain('not yet valid');
      }
    });

    it('accepts receipt with iat within clock skew tolerance', async () => {
      const { privateKey, publicKey } = await generateKeypair();
      const now = Math.floor(Date.now() / 1000);
      const futureIat = now + 100; // 100 seconds in the future, within 300s skew

      const payload = {
        iss: 'https://api.example.com',
        aud: 'https://client.example.com',
        iat: futureIat,
        rid: '01234567-0123-7123-8123-0123456789ab',
        amt: 1000,
        cur: 'USD',
        payment: {
          rail: 'x402',
          reference: 'tx_abc123',
          amount: 1000,
          currency: 'USD',
        },
      };

      const jws = await sign(payload, privateKey, 'key-2026-01');

      const result = await verifyLocal(jws, publicKey);

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
        exp: now - 100, // Expired 100 seconds ago
        privateKey,
        kid: 'key-2026-01',
      });

      // With 0 clock skew, this should fail
      const result = await verifyLocal(jws, publicKey, {
        maxClockSkew: 0,
      });

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
        exp: now + 3600, // Valid for 1 hour from actual now
        privateKey,
        kid: 'key-2026-01',
      });

      // Simulate checking at a future time when it should be expired
      const futureNow = now + 7200; // 2 hours from now

      const result = await verifyLocal(jws, publicKey, {
        now: futureNow,
        maxClockSkew: 0,
      });

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

      const result = await verifyLocal(jws, publicKey);

      expect(result.valid).toBe(true);
      if (result.valid) {
        // claims should have all expected properties from ReceiptClaimsType
        expect(typeof result.claims.iss).toBe('string');
        expect(typeof result.claims.aud).toBe('string');
        expect(typeof result.claims.iat).toBe('number');
        expect(typeof result.claims.rid).toBe('string');
        expect(typeof result.claims.amt).toBe('number');
        expect(typeof result.claims.cur).toBe('string');
        expect(typeof result.claims.payment).toBe('object');
        expect(result.claims.subject?.uri).toBe('https://api.example.com/resource');
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

      const result = await verifyLocal(jws, publicKey);

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

      const result = await verifyLocal(jws, publicKey, {
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

      const result = await verifyLocal(jws, publicKey, {
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
        // no subject
        privateKey,
        kid: 'key-2026-01',
      });

      const result = await verifyLocal(jws, publicKey, {
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

      // Get the rid from the issued receipt
      const preCheck = await verifyLocal(jws, publicKey);
      expect(preCheck.valid).toBe(true);
      if (!preCheck.valid) return;

      const rid = preCheck.claims.rid;

      // Verify with matching rid
      const result = await verifyLocal(jws, publicKey, { rid });

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

      const result = await verifyLocal(jws, publicKey, {
        rid: '00000000-0000-7000-8000-000000000000', // Different rid
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
        // no exp
        privateKey,
        kid: 'key-2026-01',
      });

      const result = await verifyLocal(jws, publicKey, {
        requireExp: false, // explicit false
      });

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
        // no exp
        privateKey,
        kid: 'key-2026-01',
      });

      const result = await verifyLocal(jws, publicKey);

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
        // no exp
        privateKey,
        kid: 'key-2026-01',
      });

      const result = await verifyLocal(jws, publicKey, {
        requireExp: true,
      });

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
        exp: now + 3600, // 1 hour from now
        privateKey,
        kid: 'key-2026-01',
      });

      const result = await verifyLocal(jws, publicKey, {
        requireExp: true,
      });

      expect(result.valid).toBe(true);
    });
  });
});
