/**
 * Unit tests for the offline public-key loader in
 * `packages/cli/src/lib/public-key.ts` (`peac verify --public-key`).
 *
 * Covers the acceptance matrix (bare public Ed25519 JWK, single-key JWKS)
 * and the fail-closed rejection matrix (private key material, multi-key /
 * empty JWKS, non-Ed25519 keys, missing or malformed `x`, invalid JSON).
 * Error messages must be user-safe and never echo key material.
 */

import { describe, it, expect } from 'vitest';
import { parsePublicKey } from '../src/lib/public-key.js';

const VALID_X = Buffer.alloc(32, 7).toString('base64url');
const VALID_JWK = { kty: 'OKP', crv: 'Ed25519', x: VALID_X };

describe('parsePublicKey', () => {
  describe('accepts', () => {
    it('a bare public Ed25519 JWK', () => {
      const bytes = parsePublicKey(JSON.stringify(VALID_JWK));
      expect(bytes).toBeInstanceOf(Uint8Array);
      expect(bytes.length).toBe(32);
    });

    it('a single-key JWKS container', () => {
      const bytes = parsePublicKey(JSON.stringify({ keys: [VALID_JWK] }));
      expect(bytes.length).toBe(32);
    });

    it('a JWK with extra non-private members (kid, alg, use)', () => {
      const jwk = { ...VALID_JWK, kid: 'sandbox-1', alg: 'EdDSA', use: 'sig' };
      expect(parsePublicKey(JSON.stringify(jwk)).length).toBe(32);
    });
  });

  describe('rejects (fail closed)', () => {
    it('private key material (d present) in a bare JWK', () => {
      const jwk = { ...VALID_JWK, d: Buffer.alloc(32, 9).toString('base64url') };
      expect(() => parsePublicKey(JSON.stringify(jwk))).toThrow(/private key material/);
    });

    it('private key material (d present) inside a JWKS', () => {
      const jwk = { ...VALID_JWK, d: Buffer.alloc(32, 9).toString('base64url') };
      expect(() => parsePublicKey(JSON.stringify({ keys: [jwk] }))).toThrow(/private key material/);
    });

    it('a multi-key JWKS', () => {
      expect(() => parsePublicKey(JSON.stringify({ keys: [VALID_JWK, VALID_JWK] }))).toThrow(
        /multiple keys/
      );
    });

    it('an empty JWKS', () => {
      expect(() => parsePublicKey(JSON.stringify({ keys: [] }))).toThrow(/no keys/);
    });

    it('a JWKS whose keys member is not an array', () => {
      expect(() => parsePublicKey(JSON.stringify({ keys: 'nope' }))).toThrow(/no keys/);
    });

    it('a JWKS entry that is not an object', () => {
      expect(() => parsePublicKey(JSON.stringify({ keys: ['nope'] }))).toThrow(/not a JWK object/);
    });

    it('a non-OKP key type', () => {
      expect(() => parsePublicKey(JSON.stringify({ kty: 'EC', crv: 'P-256', x: VALID_X }))).toThrow(
        /Ed25519/
      );
    });

    it('a non-Ed25519 curve', () => {
      expect(() =>
        parsePublicKey(JSON.stringify({ kty: 'OKP', crv: 'X25519', x: VALID_X }))
      ).toThrow(/Ed25519/);
    });

    it('a JWK missing x', () => {
      expect(() => parsePublicKey(JSON.stringify({ kty: 'OKP', crv: 'Ed25519' }))).toThrow(
        /missing public key value/
      );
    });

    it('a JWK with empty x', () => {
      expect(() => parsePublicKey(JSON.stringify({ kty: 'OKP', crv: 'Ed25519', x: '' }))).toThrow(
        /missing public key value/
      );
    });

    it('an x that is not 32 bytes', () => {
      const shortX = Buffer.alloc(16, 7).toString('base64url');
      expect(() =>
        parsePublicKey(JSON.stringify({ kty: 'OKP', crv: 'Ed25519', x: shortX }))
      ).toThrow(/32-byte/);
    });

    it('an x that is not base64url', () => {
      expect(() =>
        parsePublicKey(JSON.stringify({ kty: 'OKP', crv: 'Ed25519', x: '!!!not-base64url!!!' }))
      ).toThrow(/32-byte/);
    });

    it('invalid JSON', () => {
      expect(() => parsePublicKey('{not json')).toThrow(/not valid JSON/);
    });

    it('a JSON array', () => {
      expect(() => parsePublicKey(JSON.stringify([VALID_JWK]))).toThrow(/JWK or single-key JWKS/);
    });

    it('a JSON primitive', () => {
      expect(() => parsePublicKey(JSON.stringify('key'))).toThrow(/JWK or single-key JWKS/);
    });
  });

  describe('error hygiene', () => {
    it('never echoes key material in error messages', () => {
      const secret = Buffer.alloc(32, 9).toString('base64url');
      const jwk = { ...VALID_JWK, d: secret };
      try {
        parsePublicKey(JSON.stringify(jwk));
        expect.unreachable('expected parsePublicKey to throw');
      } catch (err) {
        expect((err as Error).message).not.toContain(secret);
        expect((err as Error).message).not.toContain(VALID_X);
      }
    });
  });
});
