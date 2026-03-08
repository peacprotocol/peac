/**
 * Parity tests: issue() and issueWire02() produce equivalent outputs.
 *
 * issue() is the canonical public issuance API (thin alias over issueWire02).
 * These tests verify structural equivalence for the same input.
 */

import { describe, it, expect } from 'vitest';
import { generateKeypair } from '@peac/crypto';
import { issue, issueWire02 } from '../src/issue';
import { verifyLocal } from '../src/verify-local';

describe('issue() and issueWire02() parity', () => {
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

  it('issue() and issueWire02() produce structurally equivalent receipts', async () => {
    const { publicKey, privateKey } = await generateKeypair();

    const opts = {
      iss: 'https://api.example.com',
      kind: 'evidence' as const,
      type: 'org.peacprotocol/access-decision',
      pillars: ['access' as const],
      jti: 'fixed-jti-for-parity',
      privateKey,
      kid: 'parity-key',
    };

    const resultA = await issue(opts);
    const resultB = await issueWire02(opts);

    // Both produce valid JWS strings
    expect(typeof resultA.jws).toBe('string');
    expect(typeof resultB.jws).toBe('string');

    // Both verify successfully as Wire 0.2
    const verifyA = await verifyLocal(resultA.jws, publicKey);
    const verifyB = await verifyLocal(resultB.jws, publicKey);
    expect(verifyA.valid).toBe(true);
    expect(verifyB.valid).toBe(true);

    if (verifyA.valid && verifyB.valid) {
      // Same structural claims (iat differs due to timing, but kind/type/iss match)
      expect(verifyA.claims.kind).toBe(verifyB.claims.kind);
      expect(verifyA.claims.type).toBe(verifyB.claims.type);
      expect(verifyA.claims.iss).toBe(verifyB.claims.iss);
      expect(verifyA.claims.jti).toBe(verifyB.claims.jti);
      expect(verifyA.wireVersion).toBe(verifyB.wireVersion);
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
