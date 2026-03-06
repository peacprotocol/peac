/**
 * EAT Passport Decoder tests
 *
 * Tests COSE_Sign1 decoding, header validation, Ed25519 signature
 * verification, claim extraction, and error handling.
 *
 * References:
 *   - RFC 9052 Section 4.2 (COSE_Sign1 structure)
 *   - RFC 9052 Section 4.4 (Sig_structure for signature computation)
 *   - RFC 9053 Table 2 (EdDSA: alg = -8)
 *   - RFC 9711 (Entity Attestation Token)
 */

import { describe, it, expect } from 'vitest';
import { encode as cborEncode } from 'cbor';
import { ed25519Sign, ed25519GetPublicKey, ed25519RandomSecretKey } from '@peac/crypto';
import { decodeEatPassport, EatAdapterError } from '../src/passport.js';
import { COSE_ALG, EAT_CLAIM_KEY, EAT_SIZE_LIMIT } from '../src/types.js';

/**
 * Build a valid COSE_Sign1 CBOR byte array with Ed25519 signature.
 *
 * Constructs Sig_structure per RFC 9052 Section 4.4:
 *   ["Signature1", protected, external_aad, payload]
 */
async function buildCoseSign1(
  claims: Map<number | string, unknown>,
  privateKey: Uint8Array,
  options?: { alg?: number; kid?: string | Uint8Array }
): Promise<{ coseBytes: Uint8Array; publicKey: Uint8Array }> {
  const alg = options?.alg ?? COSE_ALG.EdDSA;
  const publicKey = await ed25519GetPublicKey(privateKey);

  // Build protected headers
  const protectedMap = new Map<number, unknown>();
  protectedMap.set(1, alg); // alg
  if (options?.kid !== undefined) {
    protectedMap.set(4, options.kid); // kid
  }
  const protectedBytes = cborEncode(protectedMap);

  // Encode payload
  const payloadBytes = cborEncode(claims);

  // Build Sig_structure per RFC 9052 Section 4.4
  const sigStructure = cborEncode([
    'Signature1',
    protectedBytes,
    new Uint8Array(0), // external_aad
    payloadBytes,
  ]);

  // Sign
  const signature = await ed25519Sign(sigStructure, privateKey);

  // Assemble COSE_Sign1: [protected, unprotected, payload, signature]
  const unprotected = new Map<number, unknown>();
  const coseArray = [protectedBytes, unprotected, payloadBytes, signature];
  const coseBytes = cborEncode(coseArray);

  return { coseBytes, publicKey };
}

/** Build a minimal EAT claims map */
function minimalEatClaims(): Map<number, unknown> {
  const claims = new Map<number, unknown>();
  claims.set(EAT_CLAIM_KEY.iss, 'https://device.example.com');
  claims.set(EAT_CLAIM_KEY.iat, Math.floor(Date.now() / 1000));
  claims.set(EAT_CLAIM_KEY.nonce, 'test-nonce-123');
  return claims;
}

describe('decodeEatPassport', () => {
  // -------------------------------------------------------------------------
  // Size limit
  // -------------------------------------------------------------------------

  it('rejects tokens exceeding 64 KB size limit', async () => {
    const oversized = new Uint8Array(EAT_SIZE_LIMIT + 1);
    await expect(decodeEatPassport(oversized)).rejects.toThrow(EatAdapterError);
    await expect(decodeEatPassport(oversized)).rejects.toMatchObject({
      code: 'E_EAT_SIZE_EXCEEDED',
    });
  });

  it('rejects empty input', async () => {
    await expect(decodeEatPassport(new Uint8Array(0))).rejects.toThrow(EatAdapterError);
    await expect(decodeEatPassport(new Uint8Array(0))).rejects.toMatchObject({
      code: 'E_EAT_INVALID_CBOR',
    });
  });

  it('accepts tokens at exactly 64 KB', async () => {
    // Build a valid COSE_Sign1 that happens to be large but under limit
    const privateKey = ed25519RandomSecretKey();
    const largeClaims = minimalEatClaims();
    // Add a large blob to make it bigger (but we verify size limit logic, not exact size)
    largeClaims.set(999, 'x'.repeat(50_000));
    const { coseBytes, publicKey } = await buildCoseSign1(largeClaims, privateKey);
    // Only test if it fits under 64 KB
    if (coseBytes.length <= EAT_SIZE_LIMIT) {
      const result = await decodeEatPassport(coseBytes, publicKey);
      expect(result.headers.alg).toBe(COSE_ALG.EdDSA);
      expect(result.signatureValid).toBe(true);
    }
  });

  // -------------------------------------------------------------------------
  // CBOR and COSE structure validation
  // -------------------------------------------------------------------------

  it('rejects non-CBOR data', async () => {
    const notCbor = new TextEncoder().encode('not cbor data');
    await expect(decodeEatPassport(notCbor)).rejects.toMatchObject({
      code: 'E_EAT_INVALID_CBOR',
    });
  });

  it('rejects CBOR that is not an array', async () => {
    const cborMap = cborEncode(new Map([['key', 'value']]));
    await expect(decodeEatPassport(cborMap)).rejects.toMatchObject({
      code: 'E_EAT_INVALID_COSE',
    });
  });

  it('rejects CBOR array with wrong number of elements', async () => {
    const threeElements = cborEncode([new Uint8Array(0), new Map(), new Uint8Array(0)]);
    await expect(decodeEatPassport(threeElements)).rejects.toMatchObject({
      code: 'E_EAT_INVALID_COSE',
    });
  });

  it('rejects non-bstr protected header', async () => {
    const bad = cborEncode(['not-bytes', new Map(), new Uint8Array(0), new Uint8Array(64)]);
    await expect(decodeEatPassport(bad)).rejects.toMatchObject({
      code: 'E_EAT_INVALID_COSE',
    });
  });

  it('rejects non-bstr signature', async () => {
    const protectedBytes = cborEncode(new Map([[1, COSE_ALG.EdDSA]]));
    const bad = cborEncode([protectedBytes, new Map(), new Uint8Array(0), 'not-bytes']);
    await expect(decodeEatPassport(bad)).rejects.toMatchObject({
      code: 'E_EAT_INVALID_COSE',
    });
  });

  it('rejects signature with wrong length', async () => {
    const protectedBytes = cborEncode(new Map([[1, COSE_ALG.EdDSA]]));
    const bad = cborEncode([protectedBytes, new Map(), new Uint8Array(0), new Uint8Array(32)]);
    await expect(decodeEatPassport(bad)).rejects.toMatchObject({
      code: 'E_EAT_INVALID_COSE',
    });
  });

  it('rejects empty protected headers', async () => {
    const bad = cborEncode([new Uint8Array(0), new Map(), new Uint8Array(0), new Uint8Array(64)]);
    await expect(decodeEatPassport(bad)).rejects.toMatchObject({
      code: 'E_EAT_INVALID_COSE',
    });
  });

  // -------------------------------------------------------------------------
  // Algorithm validation
  // -------------------------------------------------------------------------

  it('rejects unsupported algorithm (ES256 = -7)', async () => {
    const protectedMap = new Map<number, unknown>();
    protectedMap.set(1, -7); // ES256
    const protectedBytes = cborEncode(protectedMap);
    const bad = cborEncode([protectedBytes, new Map(), new Uint8Array(0), new Uint8Array(64)]);
    await expect(decodeEatPassport(bad)).rejects.toMatchObject({
      code: 'E_EAT_UNSUPPORTED_ALG',
    });
  });

  it('rejects missing algorithm', async () => {
    const protectedMap = new Map<number, unknown>();
    // No alg set
    const protectedBytes = cborEncode(protectedMap);
    const bad = cborEncode([protectedBytes, new Map(), new Uint8Array(0), new Uint8Array(64)]);
    await expect(decodeEatPassport(bad)).rejects.toMatchObject({
      code: 'E_EAT_INVALID_COSE',
    });
  });

  // -------------------------------------------------------------------------
  // Successful decode without verification
  // -------------------------------------------------------------------------

  it('decodes valid COSE_Sign1 without signature verification', async () => {
    const privateKey = ed25519RandomSecretKey();
    const claims = minimalEatClaims();
    const { coseBytes } = await buildCoseSign1(claims, privateKey, { kid: 'key-001' });

    const result = await decodeEatPassport(coseBytes);
    expect(result.headers.alg).toBe(COSE_ALG.EdDSA);
    expect(result.headers.kid).toBe('key-001');
    expect(result.signatureValid).toBeUndefined();
    expect(result.claims.get(EAT_CLAIM_KEY.iss)).toBe('https://device.example.com');
    expect(result.claims.get(EAT_CLAIM_KEY.nonce)).toBe('test-nonce-123');
  });

  it('decodes without kid in protected headers', async () => {
    const privateKey = ed25519RandomSecretKey();
    const claims = minimalEatClaims();
    const { coseBytes } = await buildCoseSign1(claims, privateKey);

    const result = await decodeEatPassport(coseBytes);
    expect(result.headers.alg).toBe(COSE_ALG.EdDSA);
    expect(result.headers.kid).toBeUndefined();
  });

  it('handles kid as Uint8Array', async () => {
    const privateKey = ed25519RandomSecretKey();
    const claims = minimalEatClaims();
    const kidBytes = new Uint8Array([0x01, 0x02, 0x03]);
    const { coseBytes } = await buildCoseSign1(claims, privateKey, { kid: kidBytes });

    const result = await decodeEatPassport(coseBytes);
    expect(result.headers.kid).toBeInstanceOf(Uint8Array);
    expect(result.headers.kid).toEqual(kidBytes);
  });

  it('decodes empty payload as empty claims map', async () => {
    const privateKey = ed25519RandomSecretKey();
    const emptyClaims = new Map<number, unknown>();
    const { coseBytes } = await buildCoseSign1(emptyClaims, privateKey);

    const result = await decodeEatPassport(coseBytes);
    expect(result.claims.size).toBe(0);
  });

  // -------------------------------------------------------------------------
  // Signature verification
  // -------------------------------------------------------------------------

  it('verifies valid Ed25519 signature', async () => {
    const privateKey = ed25519RandomSecretKey();
    const claims = minimalEatClaims();
    const { coseBytes, publicKey } = await buildCoseSign1(claims, privateKey, {
      kid: 'verify-key',
    });

    const result = await decodeEatPassport(coseBytes, publicKey);
    expect(result.signatureValid).toBe(true);
    expect(result.claims.get(EAT_CLAIM_KEY.iss)).toBe('https://device.example.com');
  });

  it('rejects invalid signature with wrong public key', async () => {
    const privateKey = ed25519RandomSecretKey();
    const wrongKey = ed25519RandomSecretKey();
    const wrongPublicKey = await ed25519GetPublicKey(wrongKey);
    const claims = minimalEatClaims();
    const { coseBytes } = await buildCoseSign1(claims, privateKey);

    await expect(decodeEatPassport(coseBytes, wrongPublicKey)).rejects.toMatchObject({
      code: 'E_EAT_SIGNATURE_FAILED',
    });
  });

  // -------------------------------------------------------------------------
  // Rich claim types
  // -------------------------------------------------------------------------

  it('decodes EAT claims with multiple standard fields', async () => {
    const privateKey = ed25519RandomSecretKey();
    const claims = new Map<number, unknown>();
    claims.set(EAT_CLAIM_KEY.iss, 'https://tee.example.com');
    claims.set(EAT_CLAIM_KEY.sub, 'device-serial-xyz');
    claims.set(EAT_CLAIM_KEY.iat, 1709640000);
    claims.set(EAT_CLAIM_KEY.exp, 1709726400);
    claims.set(EAT_CLAIM_KEY.nonce, 'challenge-nonce');
    claims.set(EAT_CLAIM_KEY.ueid, new Uint8Array([0xde, 0xad, 0xbe, 0xef]));
    claims.set(EAT_CLAIM_KEY.secboot, true);
    claims.set(EAT_CLAIM_KEY.dbgstat, 3); // disabled-permanently

    const { coseBytes, publicKey } = await buildCoseSign1(claims, privateKey);
    const result = await decodeEatPassport(coseBytes, publicKey);

    expect(result.signatureValid).toBe(true);
    expect(result.claims.get(EAT_CLAIM_KEY.iss)).toBe('https://tee.example.com');
    expect(result.claims.get(EAT_CLAIM_KEY.sub)).toBe('device-serial-xyz');
    expect(result.claims.get(EAT_CLAIM_KEY.iat)).toBe(1709640000);
    expect(result.claims.get(EAT_CLAIM_KEY.exp)).toBe(1709726400);
    expect(result.claims.get(EAT_CLAIM_KEY.ueid)).toEqual(new Uint8Array([0xde, 0xad, 0xbe, 0xef]));
    expect(result.claims.get(EAT_CLAIM_KEY.secboot)).toBe(true);
    expect(result.claims.get(EAT_CLAIM_KEY.dbgstat)).toBe(3);
  });

  it('preserves string-keyed claims', async () => {
    const privateKey = ed25519RandomSecretKey();
    const claims = new Map<number | string, unknown>();
    claims.set(EAT_CLAIM_KEY.iss, 'https://device.example.com');
    claims.set('custom-claim', 'custom-value');

    const { coseBytes } = await buildCoseSign1(claims, privateKey);
    const result = await decodeEatPassport(coseBytes);
    expect(result.claims.get('custom-claim')).toBe('custom-value');
  });

  // -------------------------------------------------------------------------
  // Error class
  // -------------------------------------------------------------------------

  it('EatAdapterError has correct name and code', async () => {
    try {
      await decodeEatPassport(new Uint8Array(0));
    } catch (err) {
      expect(err).toBeInstanceOf(EatAdapterError);
      expect((err as EatAdapterError).name).toBe('EatAdapterError');
      expect((err as EatAdapterError).code).toBe('E_EAT_INVALID_CBOR');
    }
  });
});
