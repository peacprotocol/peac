/**
 * Shared test helpers for protocol property tests.
 *
 * Centralizes Ed25519 raw JWS signing, PKCS#8 wrapping, and constants
 * that were previously duplicated across verify-local-order.test.ts and
 * strictness.property.test.ts.
 */

import { subtle } from 'node:crypto';
import { WIRE_02_JWS_TYP } from '@peac/kernel';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Fixed epoch for deterministic tests (2026-03-06T00:00:00Z) */
export const FIXED_IAT = 1772611200;

export const TEST_KID = '2026-03-07T00:00:00Z';
export const TEST_ISS = 'https://api.example.com';
export const TEST_TYPE = 'org.peacprotocol/commerce';

// ---------------------------------------------------------------------------
// Ed25519 PKCS#8 wrapping (RFC 8410)
// ---------------------------------------------------------------------------

/** PKCS8 prefix for Ed25519 raw key wrapping (RFC 8410) */
const ED25519_PKCS8_PREFIX = new Uint8Array([
  0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x04, 0x22, 0x04, 0x20,
]);

/**
 * Import a raw Ed25519 private key as a CryptoKey for signing.
 * Wraps the 32-byte seed in PKCS#8 (RFC 8410) format.
 */
export async function importEd25519(privateKeyBytes: Uint8Array): Promise<CryptoKey> {
  const pkcs8 = new Uint8Array(48);
  pkcs8.set(ED25519_PKCS8_PREFIX);
  pkcs8.set(privateKeyBytes, 16);
  return subtle.importKey('pkcs8', pkcs8, { name: 'Ed25519' }, false, ['sign']);
}

// ---------------------------------------------------------------------------
// Base64url helpers
// ---------------------------------------------------------------------------

function base64urlEncode(bytes: Uint8Array): string {
  const b64 = Buffer.from(bytes).toString('base64');
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64urlEncodeString(str: string): string {
  return base64urlEncode(new TextEncoder().encode(str));
}

// ---------------------------------------------------------------------------
// Raw JWS signing
// ---------------------------------------------------------------------------

/**
 * Sign a JWS with arbitrary header fields, allowing injection of
 * hazardous or non-standard fields that issueWire02() would reject.
 *
 * Two calling conventions:
 *   signRawJWS(header, payload, privateKey)       // full header control
 *   signRawJWS(payload, privateKey, kid, extra)    // legacy (verify-local-order style)
 */
export async function signRawJWS(
  header: Record<string, unknown>,
  payload: Record<string, unknown>,
  privateKey: Uint8Array
): Promise<string> {
  const headerB64 = base64urlEncodeString(JSON.stringify(header));
  const payloadB64 = base64urlEncodeString(JSON.stringify(payload));
  const signingInput = `${headerB64}.${payloadB64}`;
  const signingInputBytes = new TextEncoder().encode(signingInput);
  const cryptoKey = await importEd25519(privateKey);
  const signatureBytes = await subtle.sign('Ed25519', cryptoKey, signingInputBytes);
  const signatureB64 = base64urlEncode(new Uint8Array(signatureBytes));
  return `${signingInput}.${signatureB64}`;
}

/**
 * Build a minimal valid Wire 0.2 payload with FIXED_IAT for determinism.
 */
export function buildWire02Payload(
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    peac_version: '0.2',
    kind: 'evidence',
    type: TEST_TYPE,
    iss: TEST_ISS,
    iat: FIXED_IAT,
    jti: `prop-test-${Math.random().toString(36).slice(2, 10)}`,
    ...overrides,
  };
}

/**
 * Build a Wire 0.2 header with defaults.
 */
export function buildWire02Header(
  kid: string = TEST_KID,
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    alg: 'EdDSA',
    typ: WIRE_02_JWS_TYP,
    kid,
    ...overrides,
  };
}
