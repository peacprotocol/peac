/**
 * Property-based tests for JWS decode, verify, and JOSE hardening (DD-156, DD-158)
 *
 * Uses fast-check to verify invariants across generated inputs:
 * 1. Malformed JWS never crashes decode(): always throws CryptoError with stable code
 * 2. validateWire02Header: any header object returns void or throws CryptoError
 * 3. Random JWS strings never crash verify(): always throws or returns typed result
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { decode, verify, validateWire02Header, generateKeypair } from '../src/index';
import { CryptoError } from '../src/errors';

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/** Generate a random base64url-like string */
const base64urlChar = fc.stringMatching(/^[A-Za-z0-9_-]{0,200}$/);

/** Generate a 3-part dot-separated string (JWS-like) */
const jwsLikeString = fc
  .tuple(base64urlChar, base64urlChar, base64urlChar)
  .map(([h, p, s]) => `${h}.${p}.${s}`);

/** Generate a completely random string */
const randomString = fc.string({ maxLength: 500 });

/** Generate a random header-like object for validateWire02Header */
const randomHeader = fc.record(
  {
    alg: fc.oneof(fc.constant('EdDSA'), fc.string({ maxLength: 20 })),
    kid: fc.oneof(fc.string({ maxLength: 300 }), fc.constant(''), fc.constant(undefined)),
    typ: fc.oneof(
      fc.constant('interaction-record+jwt'),
      fc.constant('peac-receipt/0.1'),
      fc.string({ maxLength: 50 }),
      fc.constant(undefined)
    ),
    jwk: fc.oneof(fc.constant(undefined), fc.constant({})),
    x5c: fc.oneof(fc.constant(undefined), fc.constant([])),
    x5u: fc.oneof(fc.constant(undefined), fc.constant('https://example.com')),
    jku: fc.oneof(fc.constant(undefined), fc.constant('https://example.com')),
    crit: fc.oneof(fc.constant(undefined), fc.constant(['ext'])),
    b64: fc.oneof(fc.constant(undefined), fc.constant(false), fc.constant(true)),
    zip: fc.oneof(fc.constant(undefined), fc.constant('DEF')),
  },
  { requiredKeys: [] }
);

// ---------------------------------------------------------------------------
// Property 1: decode() never crashes on any string input
// ---------------------------------------------------------------------------

describe('Property: decode() robustness', () => {
  it('random strings never crash decode(): always throws CryptoError', () => {
    fc.assert(
      fc.property(randomString, (input) => {
        try {
          decode(input);
          // If it succeeds, it must return a valid structure
          return true;
        } catch (err) {
          // Must be a CryptoError, not an unhandled exception
          expect(err).toBeInstanceOf(CryptoError);
          expect((err as CryptoError).code).toMatch(/^CRYPTO_/);
          return true;
        }
      }),
      { numRuns: 1000 }
    );
  });

  it('JWS-like strings (3 dot-parts) never crash decode()', () => {
    fc.assert(
      fc.property(jwsLikeString, (input) => {
        try {
          const result = decode(input);
          // If decode succeeds, structure must be typed
          expect(result).toHaveProperty('header');
          expect(result).toHaveProperty('payload');
          expect(result.header).toHaveProperty('alg', 'EdDSA');
          return true;
        } catch (err) {
          expect(err).toBeInstanceOf(CryptoError);
          return true;
        }
      }),
      { numRuns: 1000 }
    );
  });
});

// ---------------------------------------------------------------------------
// Property 2: validateWire02Header invariants
// ---------------------------------------------------------------------------

describe('Property: validateWire02Header JOSE hardening', () => {
  it('any header object returns void or throws CryptoError', () => {
    fc.assert(
      fc.property(randomHeader, (header) => {
        try {
          validateWire02Header(header as Record<string, unknown>);
          // If it succeeds, the header must have a valid kid
          expect(typeof header.kid).toBe('string');
          expect((header.kid as string).length).toBeGreaterThan(0);
          expect((header.kid as string).length).toBeLessThanOrEqual(256);
          // No embedded keys
          expect(header.jwk).toBeUndefined();
          expect(header.x5c).toBeUndefined();
          expect(header.x5u).toBeUndefined();
          expect(header.jku).toBeUndefined();
          // No crit, b64:false, zip
          expect(header.crit).toBeUndefined();
          expect(header.b64).not.toBe(false);
          expect(header.zip).toBeUndefined();
          return true;
        } catch (err) {
          expect(err).toBeInstanceOf(CryptoError);
          expect((err as CryptoError).code).toMatch(/^CRYPTO_JWS_/);
          return true;
        }
      }),
      { numRuns: 1000 }
    );
  });

  it('embedded key material is always rejected', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('jwk', 'x5c', 'x5u', 'jku'),
        fc.string({ minLength: 1, maxLength: 20 }),
        (keyField, kid) => {
          const header: Record<string, unknown> = { kid, [keyField]: {} };
          expect(() => validateWire02Header(header)).toThrow(CryptoError);
        }
      ),
      { numRuns: 200 }
    );
  });
});

// ---------------------------------------------------------------------------
// Property 3: verify() never crashes on random inputs
// ---------------------------------------------------------------------------

describe('Property: verify() robustness', () => {
  it('random JWS strings never throw unhandled exceptions', async () => {
    const { publicKey } = await generateKeypair();

    // Test with a sample of random strings (async properties need manual loop)
    const values = fc.sample(randomString, 200);
    for (const input of values) {
      try {
        await verify(input, publicKey);
      } catch (err) {
        // Must be a CryptoError, not an unhandled exception
        expect(err).toBeInstanceOf(CryptoError);
        expect((err as CryptoError).code).toMatch(/^CRYPTO_/);
      }
    }
  });

  it('JWS-like strings never throw unhandled exceptions in verify()', async () => {
    const { publicKey } = await generateKeypair();

    const values = fc.sample(jwsLikeString, 200);
    for (const input of values) {
      try {
        const result = await verify(input, publicKey);
        // If verify returns, result must have valid shape
        expect(typeof result.valid).toBe('boolean');
        expect(result.header).toHaveProperty('alg', 'EdDSA');
      } catch (err) {
        expect(err).toBeInstanceOf(CryptoError);
      }
    }
  });
});
