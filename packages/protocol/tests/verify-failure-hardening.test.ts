/**
 * Receipt verification failure hardening.
 *
 * Locks two behaviors on both verification paths:
 *   1. Unexpected verification exceptions return a stable generic message
 *      instead of caller-visible raw exception text (no path/state leakage).
 *   2. Wrong-length Ed25519 signatures are rejected deterministically as
 *      invalid signature failures (Wire 0.1: reason `invalid_signature`;
 *      current path: code `E_INVALID_SIGNATURE`) rather than surfacing as
 *      generic verification/internal errors.
 *
 * Also confirms valid receipts and typed CryptoError passthroughs are unchanged.
 */

import { afterEach, describe, it, expect, vi } from 'vitest';
import { base64urlEncode, generateKeypair } from '@peac/crypto';
import { issue, issueWire01 } from '../src/index.js';
import { verifyLocal } from '../src/verify-local';
import { verifyLocalWire01 } from '../src/verify-local-wire01';
import { verifyReceipt } from '../src/verify';
import { ED25519_SIGNATURE_BYTES, ed25519SignatureByteLength } from '../src/_internal/signature';
import { defaultCodec } from '../src/_internal/record-core/codec/jws-jwt.js';

// Mock JWKS discovery so verifyReceipt() runs fully offline.
vi.mock('../src/jwks-resolver.js', () => ({ resolveJWKS: vi.fn() }));
import { resolveJWKS } from '../src/jwks-resolver.js';
const resolveJWKSMock = vi.mocked(resolveJWKS);

// Restore spies and reset the JWKS mock after each test so a failed assertion
// cannot leak a mocked global (or a stale resolved/rejected value) into later
// tests.
afterEach(() => {
  vi.restoreAllMocks();
  resolveJWKSMock.mockReset();
});

const KID = 'key-2026-01';

/** Replace the signature segment of a compact JWS with `nBytes` zero bytes. */
function withSignatureBytes(jws: string, nBytes: number): string {
  const [header, payload] = jws.split('.');
  return `${header}.${payload}.${base64urlEncode(new Uint8Array(nBytes))}`;
}

function jwkFor(publicKey: Uint8Array, kid = KID) {
  return { kty: 'OKP', crv: 'Ed25519', x: base64urlEncode(publicKey), kid };
}

function jwksOk(jwk: unknown) {
  return { ok: true, fromCache: true, jwks: { keys: [jwk] } };
}

async function issueWire01Receipt(privateKey: Uint8Array) {
  return issueWire01({
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
    kid: KID,
  });
}

async function issueWire02Receipt(privateKey: Uint8Array) {
  return issue({
    iss: 'https://issuer.example',
    kind: 'evidence',
    type: 'org.example/h5a-fixture',
    kid: 'k1',
    purpose_declared: 'h5a-fixture',
    pillars: ['safety'],
    privateKey,
  });
}

// ---------------------------------------------------------------------------
// Internal Ed25519 signature-width guard
// ---------------------------------------------------------------------------

describe('ed25519SignatureByteLength()', () => {
  it('exposes the fixed Ed25519 signature width', () => {
    expect(ED25519_SIGNATURE_BYTES).toBe(64);
  });

  it('returns the decoded byte length for a 3-part compact JWS', () => {
    for (const n of [0, 1, 32, 63, 64, 65, 96]) {
      const jws = `aaaa.bbbb.${base64urlEncode(new Uint8Array(n))}`;
      expect(ed25519SignatureByteLength(jws)).toBe(n);
    }
  });

  it('returns null for tokens that are not a 3-part compact JWS', () => {
    expect(ed25519SignatureByteLength('')).toBeNull();
    expect(ed25519SignatureByteLength('a.b')).toBeNull();
    expect(ed25519SignatureByteLength('a.b.c.d')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// verifyLocal() (current path)
// ---------------------------------------------------------------------------

describe('verifyLocal(): failure hardening', () => {
  it('rejects wrong-length Ed25519 signatures as E_INVALID_SIGNATURE', async () => {
    const { privateKey, publicKey } = await generateKeypair();
    const { jws } = await issueWire02Receipt(privateKey);

    for (const n of [0, 1, 63, 65]) {
      const result = await verifyLocal(withSignatureBytes(jws, n), publicKey);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.code).toBe('E_INVALID_SIGNATURE');
        expect(result.message).toBe('Ed25519 signature has invalid length');
      }
    }
  });

  it('accepts a valid 64-byte signature unchanged', async () => {
    const { privateKey, publicKey } = await generateKeypair();
    const { jws } = await issueWire02Receipt(privateKey);

    const result = await verifyLocal(jws, publicKey);
    expect(result.valid).toBe(true);
  });

  it('genericizes unexpected (non-typed) errors as E_INTERNAL without raw text', async () => {
    const { privateKey, publicKey } = await generateKeypair();
    const { jws } = await issueWire02Receipt(privateKey);

    vi.spyOn(defaultCodec, 'decode').mockRejectedValueOnce(
      new Error('/tmp/secret/internal boom-from-test')
    );

    const result = await verifyLocal(jws, publicKey);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.code).toBe('E_INTERNAL');
      expect(result.message).toBe('Unexpected verification error.');
      expect(result.message).not.toContain('boom-from-test');
      expect(result.message).not.toContain('secret');
    }
  });

  it('preserves typed CryptoError messages (E_INVALID_FORMAT passthrough)', async () => {
    const { privateKey, publicKey } = await generateKeypair();
    const { jws } = await issueWire02Receipt(privateKey);

    // Keep the (valid-width) signature, corrupt the payload segment so the
    // crypto codec raises a typed CRYPTO_INVALID_JWS_FORMAT before signature
    // verification. The controlled crypto message must still pass through.
    const [header, , signature] = jws.split('.');
    const badPayload = base64urlEncode(new TextEncoder().encode('not json {{{'));
    const result = await verifyLocal(`${header}.${badPayload}.${signature}`, publicKey);

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.code).toBe('E_INVALID_FORMAT');
      expect(result.message).not.toBe('Unexpected verification error.');
      // The I-JSON (RFC 7493) gate now runs on the raw payload bytes before
      // JSON.parse, so a non-JSON payload is reported by the raw-input scanner
      // (CRYPTO_INVALID_JWS_FORMAT -> E_INVALID_FORMAT) with a specific I-JSON
      // message rather than the JSON.parse fallback "JWS payload" message. Both
      // are valid typed passthroughs; the contract is that it is not genericized.
      expect(result.message).toMatch(/JWS|I-JSON/);
    }
  });
});

// ---------------------------------------------------------------------------
// verifyReceipt() (Wire 0.1, JWKS-backed; mocked offline)
// ---------------------------------------------------------------------------

describe('verifyReceipt(): failure hardening', () => {
  it('rejects wrong-length Ed25519 signatures as invalid_signature', async () => {
    const { privateKey, publicKey } = await generateKeypair();
    const { jws } = await issueWire01Receipt(privateKey);
    resolveJWKSMock.mockResolvedValue(jwksOk(jwkFor(publicKey)) as never);

    for (const n of [0, 1, 63, 65]) {
      const result = await verifyReceipt(withSignatureBytes(jws, n));
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe('invalid_signature');
        expect(result.details).toBe('Ed25519 signature has invalid length');
      }
    }
  });

  it('genericizes unexpected errors as verification_error without raw text', async () => {
    const { privateKey, publicKey } = await generateKeypair();
    const { jws } = await issueWire01Receipt(privateKey);
    // A JWK whose x is the wrong width makes jwkToPublicKey throw a raw Error
    // ("Ed25519 public key must be 32 bytes") inside the verify body.
    const badJwk = {
      kty: 'OKP',
      crv: 'Ed25519',
      x: base64urlEncode(publicKey.slice(0, 31)),
      kid: KID,
    };
    resolveJWKSMock.mockResolvedValue(jwksOk(badJwk) as never);

    const result = await verifyReceipt(jws);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('verification_error');
      expect(result.details).toBe('Unexpected verification error.');
      expect(result.details).not.toContain('32 bytes');
    }
  });

  it('does not mask a pre-verification error as invalid_signature', async () => {
    const { privateKey } = await generateKeypair();
    const { jws } = await issueWire01Receipt(privateKey);
    // An unexpected failure BEFORE signature verification (here JWKS resolution
    // throwing) must NOT be reclassified as invalid_signature just because the
    // signature segment happens to be the wrong length.
    resolveJWKSMock.mockRejectedValueOnce(new Error('/tmp/secret/jwks boom'));

    const result = await verifyReceipt(withSignatureBytes(jws, 63));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('verification_error');
      expect(result.details).toBe('Unexpected verification error.');
      expect(result.details).not.toContain('jwks boom');
      expect(result.details).not.toContain('/tmp/secret');
    }
  });

  it('accepts a valid receipt unchanged', async () => {
    const { privateKey, publicKey } = await generateKeypair();
    const { jws } = await issueWire01Receipt(privateKey);
    resolveJWKSMock.mockResolvedValue(jwksOk(jwkFor(publicKey)) as never);

    const result = await verifyReceipt(jws);
    expect(result.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// verifyLocalWire01() (Wire 0.1 local path)
// ---------------------------------------------------------------------------

describe('verifyLocalWire01(): failure hardening', () => {
  it('rejects wrong-length Ed25519 signatures as E_INVALID_SIGNATURE', async () => {
    const { privateKey, publicKey } = await generateKeypair();
    const { jws } = await issueWire01Receipt(privateKey);

    for (const n of [0, 1, 63, 65]) {
      const result = await verifyLocalWire01(withSignatureBytes(jws, n), publicKey);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.code).toBe('E_INVALID_SIGNATURE');
        expect(result.message).toBe('Ed25519 signature has invalid length');
      }
    }
  });

  it('accepts a valid 64-byte signature unchanged', async () => {
    const { privateKey, publicKey } = await generateKeypair();
    const { jws } = await issueWire01Receipt(privateKey);

    const result = await verifyLocalWire01(jws, publicKey);
    expect(result.valid).toBe(true);
  });
});
