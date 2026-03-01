/**
 * Key Rotation Fixture Self-Check Tests
 *
 * Validates that all JWK keys in key-rotation conformance fixtures
 * have valid base64url-encoded Ed25519 public keys.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * Inline base64url decode to avoid importing @peac/crypto (Layer 2)
 * from a @peac/schema (Layer 1) test. This is a test-only utility.
 */
function base64urlDecode(input: string): Uint8Array {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

const FIXTURE_PATH = resolve(
  __dirname,
  '../../../specs/conformance/fixtures/key-rotation/key-rotation.json'
);

interface JWK {
  kty: string;
  crv: string;
  kid: string;
  x: string;
}

function extractJWKs(obj: unknown, path = ''): Array<{ jwk: JWK; path: string }> {
  const results: Array<{ jwk: JWK; path: string }> = [];
  if (obj && typeof obj === 'object') {
    const record = obj as Record<string, unknown>;
    if (record.kty === 'OKP' && record.crv === 'Ed25519' && typeof record.x === 'string') {
      results.push({ jwk: record as unknown as JWK, path });
    }
    for (const [key, value] of Object.entries(record)) {
      results.push(...extractJWKs(value, `${path}.${key}`));
    }
  }
  return results;
}

describe('key-rotation fixture JWK validity', () => {
  const fixtureContent = readFileSync(FIXTURE_PATH, 'utf-8');
  const fixture = JSON.parse(fixtureContent);
  const jwks = extractJWKs(fixture);

  it('finds JWKs in fixtures', () => {
    expect(jwks.length).toBeGreaterThan(0);
  });

  for (const { jwk, path } of jwks) {
    it(`${jwk.kid} at ${path} has valid base64url x (32 bytes)`, () => {
      expect(jwk.kty).toBe('OKP');
      expect(jwk.crv).toBe('Ed25519');

      // x must be valid base64url
      const decoded = base64urlDecode(jwk.x);
      expect(decoded).toBeInstanceOf(Uint8Array);

      // Ed25519 public key is exactly 32 bytes
      expect(decoded.length).toBe(32);
    });
  }
});
