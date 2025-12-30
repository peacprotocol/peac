/**
 * Protocol Conformance Tests
 *
 * Tests semantic invariants using @peac/protocol and @peac/schema runtime validators.
 * These test cases cannot exist as JSON files because they involve:
 * - Cycles (JSON cannot represent circular references)
 * - NaN/Infinity (JSON only supports finite numbers)
 * - Invalid signatures (signature bytes are valid JSON strings)
 * - Semantic invariants (valid structure, invalid meaning)
 *
 * Conformance layers:
 * - Schema: JSON structure, types, required fields (schema.spec.ts)
 * - Protocol: Signatures, semantics, runtime invariants (this file)
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { validateEvidence, assertJsonSafeIterative, JSON_EVIDENCE_LIMITS } from '@peac/schema';
import { issue } from '@peac/protocol';
import { verify, decode, generateKeypair } from '@peac/crypto';

describe('Protocol Conformance', () => {
  describe('JSON Safety (NaN/Infinity)', () => {
    it('should reject NaN in evidence', () => {
      const evidence = {
        amount: NaN,
        currency: 'USD',
      };

      const result = validateEvidence(evidence);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('E_EVIDENCE_NOT_JSON');
        const details = result.error.details as { message?: string };
        expect(details.message).toContain('Non-finite number');
      }
    });

    it('should reject Infinity in evidence', () => {
      const evidence = {
        amount: Infinity,
        currency: 'USD',
      };

      const result = validateEvidence(evidence);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('E_EVIDENCE_NOT_JSON');
        const details = result.error.details as { message?: string };
        expect(details.message).toContain('Non-finite number');
      }
    });

    it('should reject -Infinity in evidence', () => {
      const evidence = {
        amount: -Infinity,
        currency: 'USD',
      };

      const result = validateEvidence(evidence);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('E_EVIDENCE_NOT_JSON');
        const details = result.error.details as { message?: string };
        expect(details.message).toContain('Non-finite number');
      }
    });

    it('should reject nested NaN', () => {
      const evidence = {
        payment: {
          details: {
            score: NaN,
          },
        },
      };

      const result = validateEvidence(evidence);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('E_EVIDENCE_NOT_JSON');
      }
    });
  });

  describe('Cycle Detection', () => {
    it('should reject self-referencing object', () => {
      const evidence: Record<string, unknown> = {
        name: 'test',
      };
      evidence.self = evidence; // Create cycle

      const result = assertJsonSafeIterative(evidence);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain('Cycle detected');
      }
    });

    it('should reject indirect cycle (A -> B -> A)', () => {
      const a: Record<string, unknown> = { name: 'a' };
      const b: Record<string, unknown> = { name: 'b', ref: a };
      a.ref = b; // Create cycle: a -> b -> a

      const result = assertJsonSafeIterative(a);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain('Cycle detected');
      }
    });

    it('should reject cycle in array', () => {
      const arr: unknown[] = [1, 2, 3];
      arr.push(arr); // Create cycle

      const result = assertJsonSafeIterative(arr);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain('Cycle detected');
      }
    });

    it('should allow diamond structure (A -> B, A -> C, B -> D, C -> D)', () => {
      // Diamond is NOT a cycle - D is referenced twice but not circular
      // JSON.stringify handles this correctly by duplicating the data.
      // The algorithm uses path-based cycle detection, so shared references
      // on different paths are allowed (only actual cycles are rejected).
      const d = { name: 'd' };
      const b = { name: 'b', ref: d };
      const c = { name: 'c', ref: d };
      const a = { name: 'a', refs: [b, c] };

      const result = assertJsonSafeIterative(a);

      expect(result.ok).toBe(true);
    });
  });

  describe('Non-JSON Types', () => {
    it('should reject undefined in object', () => {
      const evidence = {
        value: undefined,
      };

      const result = assertJsonSafeIterative(evidence);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain('undefined');
      }
    });

    it('should reject BigInt', () => {
      const evidence = {
        amount: BigInt(1000),
      };

      const result = assertJsonSafeIterative(evidence);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain('BigInt');
      }
    });

    it('should reject function', () => {
      const evidence = {
        callback: () => {},
      };

      const result = assertJsonSafeIterative(evidence);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain('Function');
      }
    });

    it('should reject Symbol', () => {
      const evidence = {
        id: Symbol('test'),
      };

      const result = assertJsonSafeIterative(evidence);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain('Symbol');
      }
    });

    it('should reject Date object', () => {
      const evidence = {
        timestamp: new Date(),
      };

      const result = assertJsonSafeIterative(evidence);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain('Non-plain object');
      }
    });

    it('should reject Map', () => {
      const evidence = {
        data: new Map(),
      };

      const result = assertJsonSafeIterative(evidence);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain('Non-plain object');
      }
    });

    it('should reject Set', () => {
      const evidence = {
        items: new Set(),
      };

      const result = assertJsonSafeIterative(evidence);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain('Non-plain object');
      }
    });
  });

  describe('DoS Protection Limits', () => {
    it('should reject excessive depth', () => {
      // Create deeply nested object
      let obj: Record<string, unknown> = { value: 'leaf' };
      for (let i = 0; i < 50; i++) {
        obj = { nested: obj };
      }

      const result = assertJsonSafeIterative(obj, { maxDepth: 32 });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain('Maximum depth exceeded');
      }
    });

    it('should accept depth within limit', () => {
      // Create nested object within limit
      let obj: Record<string, unknown> = { value: 'leaf' };
      for (let i = 0; i < 30; i++) {
        obj = { nested: obj };
      }

      const result = assertJsonSafeIterative(obj, { maxDepth: 32 });

      expect(result.ok).toBe(true);
    });

    it('should reject oversized array', () => {
      const arr = new Array(20000).fill(1);

      const result = assertJsonSafeIterative(arr, { maxArrayLength: 10000 });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain('Array exceeds maximum length');
      }
    });

    it('should reject object with too many keys', () => {
      const obj: Record<string, number> = {};
      for (let i = 0; i < 2000; i++) {
        obj[`key${i}`] = i;
      }

      const result = assertJsonSafeIterative(obj, { maxObjectKeys: 1000 });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain('Object exceeds maximum key count');
      }
    });

    it('should reject string exceeding max length', () => {
      const longString = 'x'.repeat(100000);
      const obj = { data: longString };

      const result = assertJsonSafeIterative(obj, { maxStringLength: 65536 });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain('String exceeds maximum length');
      }
    });

    it('should use default limits', () => {
      // Verify default limits are applied
      expect(JSON_EVIDENCE_LIMITS.maxDepth).toBe(32);
      expect(JSON_EVIDENCE_LIMITS.maxArrayLength).toBe(10000);
      expect(JSON_EVIDENCE_LIMITS.maxObjectKeys).toBe(1000);
      expect(JSON_EVIDENCE_LIMITS.maxStringLength).toBe(65536);
      expect(JSON_EVIDENCE_LIMITS.maxTotalNodes).toBe(100000);
    });
  });

  describe('Valid JSON Evidence', () => {
    it('should accept valid primitive evidence', () => {
      const result = validateEvidence('simple string');
      expect(result.ok).toBe(true);
    });

    it('should accept valid object evidence', () => {
      const evidence = {
        rail: 'x402',
        reference: 'pay_123',
        amount: 1000,
        currency: 'USD',
        nested: {
          values: [1, 2, 3],
          active: true,
          empty: null,
        },
      };

      const result = validateEvidence(evidence);
      expect(result.ok).toBe(true);
    });

    it('should accept valid array evidence', () => {
      const evidence = [
        { id: 1, name: 'first' },
        { id: 2, name: 'second' },
      ];

      const result = validateEvidence(evidence);
      expect(result.ok).toBe(true);
    });

    it('should accept null evidence', () => {
      const result = validateEvidence(null);
      expect(result.ok).toBe(true);
    });

    it('should accept boolean evidence', () => {
      expect(validateEvidence(true).ok).toBe(true);
      expect(validateEvidence(false).ok).toBe(true);
    });

    it('should accept finite numbers', () => {
      expect(validateEvidence(0).ok).toBe(true);
      expect(validateEvidence(42).ok).toBe(true);
      expect(validateEvidence(-100).ok).toBe(true);
      expect(validateEvidence(3.14159).ok).toBe(true);
      expect(validateEvidence(Number.MAX_SAFE_INTEGER).ok).toBe(true);
      expect(validateEvidence(Number.MIN_SAFE_INTEGER).ok).toBe(true);
    });
  });

  describe('End-to-End Receipt Issuance and Verification', () => {
    let privateKey: Uint8Array;
    let publicKey: Uint8Array;
    let wrongPrivateKey: Uint8Array;
    let wrongPublicKey: Uint8Array;
    const kid = '2025-01-01T00:00:00Z';

    beforeAll(async () => {
      // Generate test keypairs
      const keypair = await generateKeypair();
      privateKey = keypair.privateKey;
      publicKey = keypair.publicKey;

      const wrongKeypair = await generateKeypair();
      wrongPrivateKey = wrongKeypair.privateKey;
      wrongPublicKey = wrongKeypair.publicKey;
    });

    it('should issue and verify a valid receipt', async () => {
      // Issue receipt
      const result = await issue({
        iss: 'https://issuer.example.com',
        aud: 'https://merchant.example.com',
        amt: 1000,
        cur: 'USD',
        rail: 'x402',
        reference: 'pay_test_123',
        privateKey,
        kid,
      });

      expect(result.jws).toBeDefined();
      expect(result.jws.split('.').length).toBe(3);

      // Verify signature with correct public key
      const verified = await verify(result.jws, publicKey);
      expect(verified.valid).toBe(true);
      expect(verified.payload).toBeDefined();
    });

    it('should reject verification with wrong public key', async () => {
      // Issue receipt with one key
      const result = await issue({
        iss: 'https://issuer.example.com',
        aud: 'https://merchant.example.com',
        amt: 500,
        cur: 'USD',
        rail: 'x402',
        reference: 'pay_test_456',
        privateKey,
        kid,
      });

      // Verify with wrong public key
      const verified = await verify(result.jws, wrongPublicKey);
      expect(verified.valid).toBe(false);
    });

    it('should detect tampered payload', async () => {
      // Issue valid receipt
      const result = await issue({
        iss: 'https://issuer.example.com',
        aud: 'https://merchant.example.com',
        amt: 2000,
        cur: 'USD',
        rail: 'x402',
        reference: 'pay_test_789',
        privateKey,
        kid,
      });

      // Tamper with the payload (change amount in the encoded payload)
      const [header, payload, signature] = result.jws.split('.');

      // Decode, modify, re-encode payload
      const decodedPayload = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
      decodedPayload.amt = 1; // Tamper: reduce amount
      const tamperedPayload = Buffer.from(JSON.stringify(decodedPayload)).toString('base64url');

      const tamperedJws = `${header}.${tamperedPayload}.${signature}`;

      // Verification should fail
      const verified = await verify(tamperedJws, publicKey);
      expect(verified.valid).toBe(false);
    });

    it('should include correct claims in issued receipt', async () => {
      const issueTime = Math.floor(Date.now() / 1000);

      const result = await issue({
        iss: 'https://issuer.example.com',
        aud: 'https://merchant.example.com',
        amt: 5000,
        cur: 'EUR',
        rail: 'card',
        reference: 'ch_test_abc',
        asset: 'EUR',
        env: 'live',
        privateKey,
        kid,
      });

      // Decode without verifying to check claims
      const { payload } = decode(result.jws);
      const claims = payload as Record<string, unknown>;

      expect(claims.iss).toBe('https://issuer.example.com');
      expect(claims.aud).toBe('https://merchant.example.com');
      expect(claims.amt).toBe(5000);
      expect(claims.cur).toBe('EUR');
      expect(claims.rid).toBeDefined();
      expect(typeof claims.iat).toBe('number');
      expect(claims.iat).toBeGreaterThanOrEqual(issueTime);
      expect(claims.iat).toBeLessThanOrEqual(issueTime + 2); // Allow 2s drift

      // Check payment block
      const payment = claims.payment as Record<string, unknown>;
      expect(payment.rail).toBe('card');
      expect(payment.reference).toBe('ch_test_abc');
      expect(payment.amount).toBe(5000);
      expect(payment.currency).toBe('EUR');
      expect(payment.asset).toBe('EUR');
      expect(payment.env).toBe('live');
    });

    it('should generate unique receipt IDs (rid)', async () => {
      const rids = new Set<string>();

      // Issue 10 receipts and collect rids
      for (let i = 0; i < 10; i++) {
        const result = await issue({
          iss: 'https://issuer.example.com',
          aud: 'https://merchant.example.com',
          amt: 100 + i,
          cur: 'USD',
          rail: 'x402',
          reference: `pay_unique_${i}`,
          privateKey,
          kid,
        });

        const { payload } = decode(result.jws);
        const claims = payload as Record<string, unknown>;
        rids.add(claims.rid as string);
      }

      // All rids should be unique
      expect(rids.size).toBe(10);
    });

    it('should validate issuer URL format', async () => {
      await expect(
        issue({
          iss: 'http://insecure.example.com', // HTTP not HTTPS
          aud: 'https://merchant.example.com',
          amt: 100,
          cur: 'USD',
          rail: 'x402',
          reference: 'pay_test',
          privateKey,
          kid,
        })
      ).rejects.toThrow('Issuer URL must start with https://');
    });

    it('should validate audience URL format', async () => {
      await expect(
        issue({
          iss: 'https://issuer.example.com',
          aud: 'http://insecure.example.com', // HTTP not HTTPS
          amt: 100,
          cur: 'USD',
          rail: 'x402',
          reference: 'pay_test',
          privateKey,
          kid,
        })
      ).rejects.toThrow('Audience URL must start with https://');
    });

    it('should validate currency code format', async () => {
      await expect(
        issue({
          iss: 'https://issuer.example.com',
          aud: 'https://merchant.example.com',
          amt: 100,
          cur: 'usd', // Lowercase not allowed
          rail: 'x402',
          reference: 'pay_test',
          privateKey,
          kid,
        })
      ).rejects.toThrow('Currency must be ISO 4217 uppercase');
    });

    it('should validate amount is non-negative integer', async () => {
      await expect(
        issue({
          iss: 'https://issuer.example.com',
          aud: 'https://merchant.example.com',
          amt: -100, // Negative not allowed
          cur: 'USD',
          rail: 'x402',
          reference: 'pay_test',
          privateKey,
          kid,
        })
      ).rejects.toThrow('Amount must be a non-negative integer');

      await expect(
        issue({
          iss: 'https://issuer.example.com',
          aud: 'https://merchant.example.com',
          amt: 10.5, // Non-integer not allowed
          cur: 'USD',
          rail: 'x402',
          reference: 'pay_test',
          privateKey,
          kid,
        })
      ).rejects.toThrow('Amount must be a non-negative integer');
    });

    it('should include subject_snapshot when provided', async () => {
      const snapshot = {
        subject: {
          id: 'user:alice',
          type: 'human' as const,
          labels: ['verified'],
        },
        captured_at: '2025-01-01T00:00:00Z',
      };

      const result = await issue({
        iss: 'https://issuer.example.com',
        aud: 'https://merchant.example.com',
        amt: 1000,
        cur: 'USD',
        rail: 'x402',
        reference: 'pay_test_snapshot',
        subject_snapshot: snapshot,
        privateKey,
        kid,
      });

      expect(result.subject_snapshot).toBeDefined();
      expect(result.subject_snapshot?.subject.id).toBe('user:alice');
      expect(result.subject_snapshot?.subject.type).toBe('human');
    });

    it('should support optional expiry field', async () => {
      const futureExp = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now

      const result = await issue({
        iss: 'https://issuer.example.com',
        aud: 'https://merchant.example.com',
        amt: 1000,
        cur: 'USD',
        rail: 'x402',
        reference: 'pay_test_exp',
        exp: futureExp,
        privateKey,
        kid,
      });

      const { payload } = decode(result.jws);
      const claims = payload as Record<string, unknown>;
      expect(claims.exp).toBe(futureExp);
    });
  });
});
