/**
 * Tests for kernel constraint enforcement in verifyLocal() pipeline (DD-121)
 *
 * Validates that verifyLocal() rejects constraint-violating JWS payloads
 * with E_CONSTRAINT_VIOLATION error code. Tests use hand-crafted JWS
 * tokens with oversized payloads.
 */

import { describe, it, expect } from 'vitest';
import { generateKeypair, sign } from '@peac/crypto';
import { KERNEL_CONSTRAINTS } from '@peac/schema';
import { issueWire02 } from '../src/issue';
import { verifyLocal } from '../src/verify-local';

/**
 * Helper to create a signed JWS with arbitrary claims.
 * The claims may not conform to PEAC schema (that is intentional:
 * constraint checks run before schema validation).
 */
async function signClaims(claims: unknown, privateKey: Uint8Array, kid: string): Promise<string> {
  return sign(claims, privateKey, kid);
}

describe('verifyLocal() kernel constraints (DD-121)', () => {
  it('rejects JWS with oversized array in payload', async () => {
    const { privateKey, publicKey } = await generateKeypair();
    const bigArray = new Array(KERNEL_CONSTRAINTS.MAX_ARRAY_LENGTH + 1).fill(0);
    const claims = {
      iss: 'https://api.example.com',
      aud: 'https://client.example.com',
      iat: Math.floor(Date.now() / 1000),
      rid: '00000000-0000-0000-0000-000000000000',
      amt: 100,
      cur: 'USD',
      payment: {
        rail: 'x402',
        reference: 'tx_test',
        amount: 100,
        currency: 'USD',
        asset: 'USD',
        env: 'test',
        evidence: { items: bigArray },
      },
    };

    const jws = await signClaims(claims, privateKey, 'k1');
    const result = await verifyLocal(jws, publicKey);

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.code).toBe('E_CONSTRAINT_VIOLATION');
      expect(result.message).toContain('MAX_ARRAY_LENGTH');
    }
  });

  it('rejects JWS with too many object keys', async () => {
    const { privateKey, publicKey } = await generateKeypair();
    const bigObj: Record<string, number> = {};
    for (let i = 0; i <= KERNEL_CONSTRAINTS.MAX_OBJECT_KEYS; i++) {
      bigObj[`k${i}`] = i;
    }
    const claims = {
      iss: 'https://api.example.com',
      aud: 'https://client.example.com',
      iat: Math.floor(Date.now() / 1000),
      rid: '00000000-0000-0000-0000-000000000000',
      amt: 100,
      cur: 'USD',
      payment: {
        rail: 'x402',
        reference: 'tx_test',
        amount: 100,
        currency: 'USD',
        asset: 'USD',
        env: 'test',
        evidence: bigObj,
      },
    };

    const jws = await signClaims(claims, privateKey, 'k1');
    const result = await verifyLocal(jws, publicKey);

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.code).toBe('E_CONSTRAINT_VIOLATION');
      expect(result.message).toContain('MAX_OBJECT_KEYS');
    }
  });

  it('rejects JWS with oversized string value', async () => {
    const { privateKey, publicKey } = await generateKeypair();
    const longString = 'x'.repeat(KERNEL_CONSTRAINTS.MAX_STRING_LENGTH + 1);
    const claims = {
      iss: 'https://api.example.com',
      aud: 'https://client.example.com',
      iat: Math.floor(Date.now() / 1000),
      rid: '00000000-0000-0000-0000-000000000000',
      amt: 100,
      cur: 'USD',
      payment: {
        rail: 'x402',
        reference: 'tx_test',
        amount: 100,
        currency: 'USD',
        asset: 'USD',
        env: 'test',
        evidence: { data: longString },
      },
    };

    const jws = await signClaims(claims, privateKey, 'k1');
    const result = await verifyLocal(jws, publicKey);

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.code).toBe('E_CONSTRAINT_VIOLATION');
      expect(result.message).toContain('MAX_STRING_LENGTH');
    }
  });

  it('passes valid receipts without constraint violations', async () => {
    const { privateKey, publicKey } = await generateKeypair();
    const { jws } = await issueWire02({
      iss: 'https://api.example.com',
      kind: 'evidence',
      type: 'org.peacprotocol/payment',
      extensions: {
        'org.peacprotocol/commerce': {
          payment_rail: 'stripe',
          amount_minor: '1000',
          currency: 'USD',
        },
      },
      privateKey,
      kid: 'k1',
    });
    const result = await verifyLocal(jws, publicKey);

    expect(result.valid).toBe(true);
  });

  it('constraint check runs before schema validation', async () => {
    const { privateKey, publicKey } = await generateKeypair();
    // Claims that violate BOTH constraints AND schema:
    // constraint violation should be returned first
    const bigArray = new Array(KERNEL_CONSTRAINTS.MAX_ARRAY_LENGTH + 1).fill(0);
    const claims = {
      // Missing required fields (schema violation)
      // Plus oversized array (constraint violation)
      bad: bigArray,
    };

    const jws = await signClaims(claims, privateKey, 'k1');
    const result = await verifyLocal(jws, publicKey);

    expect(result.valid).toBe(false);
    if (!result.valid) {
      // Constraint violation should be caught first, not schema error
      expect(result.code).toBe('E_CONSTRAINT_VIOLATION');
    }
  });
});
