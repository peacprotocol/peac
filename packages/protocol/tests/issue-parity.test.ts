/**
 * Parity tests: issue() and issueWire02() produce equivalent outputs.
 *
 * issue() is the canonical public issuance API (thin alias over issueWire02).
 * These tests verify both structural equivalence and exact byte-level equality.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { generateKeypair } from '@peac/crypto';
import { issue, issueWire02 } from '../src/issue';
import { verifyLocal } from '../src/verify-local';

describe('issue() and issueWire02() parity', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('issue() produces a valid Wire 0.2 receipt', async () => {
    const { publicKey, privateKey } = await generateKeypair();

    const { jws } = await issue({
      iss: 'https://api.example.com',
      kind: 'evidence',
      type: 'org.peacprotocol/payment',
      pillars: ['commerce'],
      extensions: {
        'org.peacprotocol/commerce': {
          payment_rail: 'stripe',
          amount_minor: '10000',
          currency: 'USD',
        },
      },
      privateKey,
      kid: 'parity-test-key',
    });

    const result = await verifyLocal(jws, publicKey);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.wireVersion).toBe('0.2');
      expect(result.claims.kind).toBe('evidence');
      expect(result.claims.type).toBe('org.peacprotocol/payment');
    }
  });

  it('issue() and issueWire02() produce exact same JWS bytes under fixed time and JTI', async () => {
    const { publicKey, privateKey } = await generateKeypair();

    // Fix Date.now so iat is deterministic
    const fixedNow = 1741500000000; // 2025-03-09T...
    vi.spyOn(Date, 'now').mockReturnValue(fixedNow);

    const opts = {
      iss: 'https://api.example.com',
      kind: 'evidence' as const,
      type: 'org.peacprotocol/access-decision',
      pillars: ['access' as const],
      extensions: {
        'org.peacprotocol/access': {
          resource: 'https://example.com/api',
          action: 'read',
          decision: 'allow',
        },
      },
      jti: 'fixed-jti-for-parity-test',
      privateKey,
      kid: 'parity-key',
    };

    const resultA = await issue(opts);
    const resultB = await issueWire02(opts);

    // Exact same JWS output (byte-level equality)
    expect(resultA.jws).toBe(resultB.jws);

    // Both verify successfully as Wire 0.2
    const verified = await verifyLocal(resultA.jws, publicKey);
    expect(verified.valid).toBe(true);
    if (verified.valid) {
      expect(verified.wireVersion).toBe('0.2');
      expect(verified.claims.iat).toBe(Math.floor(fixedNow / 1000));
      expect(verified.claims.jti).toBe('fixed-jti-for-parity-test');
    }
  });

  it('issue() rejects non-canonical iss (same as issueWire02)', async () => {
    const { privateKey } = await generateKeypair();

    await expect(
      issue({
        iss: 'http://insecure.example.com',
        kind: 'evidence',
        type: 'org.peacprotocol/test',
        privateKey,
        kid: 'test-key',
      })
    ).rejects.toThrow();
  });

  it('issue() issues challenge kind receipts', async () => {
    const { publicKey, privateKey } = await generateKeypair();

    const { jws } = await issue({
      iss: 'https://api.example.com',
      kind: 'challenge',
      type: 'org.peacprotocol/payment-required',
      privateKey,
      kid: 'challenge-key',
    });

    const result = await verifyLocal(jws, publicKey);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.claims.kind).toBe('challenge');
    }
  });
});
