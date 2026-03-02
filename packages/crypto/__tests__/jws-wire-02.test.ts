/**
 * Wire 0.2 JWS tests (v0.12.0-preview.1, DD-156)
 *
 * Tests: 3-variant JWSHeader union, signWire02(), dual-stack verify/decode,
 * typ normalization, coherence checks, JOSE hardening, validateWire02Header().
 */

import { describe, it, expect } from 'vitest';
import {
  sign,
  signWire02,
  verify,
  decode,
  validateWire02Header,
  generateKeypair,
  type Wire01JWSHeader,
  type Wire02JWSHeader,
  type UnTypedJWSHeader,
} from '../src/jws';
import { CryptoError } from '../src/errors';
import { WIRE_01_JWS_TYP, WIRE_02_JWS_TYP, PEAC_ALG } from '@peac/kernel';

// Shared test fixture
const wire02Payload = {
  peac_version: '0.2',
  kind: 'evidence',
  type: 'org.peacprotocol/commerce',
  iss: 'https://api.example.com',
  iat: 1736934600,
  jti: 'test-jti-001',
};

const testKid = '2026-01-15T10:30:00Z';

// ---------------------------------------------------------------------------
// signWire02 + round-trip
// ---------------------------------------------------------------------------

describe('signWire02 and round-trip verification', () => {
  it('produces a JWS with typ: interaction-record+jwt', async () => {
    const { privateKey, publicKey } = await generateKeypair();
    const jws = await signWire02(wire02Payload, privateKey, testKid);

    const result = await verify(jws, publicKey);
    expect(result.valid).toBe(true);
    expect(result.header.typ).toBe(WIRE_02_JWS_TYP);
    expect(result.header.alg).toBe(PEAC_ALG);
    expect(result.header.kid).toBe(testKid);
    expect(result.payload).toEqual(wire02Payload);
  });

  it('always sets typ: no code path omits it', async () => {
    const { privateKey } = await generateKeypair();
    const jws = await signWire02(wire02Payload, privateKey, testKid);
    const parts = jws.split('.');
    const rawHeader = JSON.parse(Buffer.from(parts[0], 'base64url').toString());
    expect(rawHeader.typ).toBe(WIRE_02_JWS_TYP);
  });

  it('returned header is narrowable as Wire02JWSHeader', async () => {
    const { privateKey, publicKey } = await generateKeypair();
    const jws = await signWire02(wire02Payload, privateKey, testKid);
    const result = await verify(jws, publicKey);
    expect(result.valid).toBe(true);

    // TypeScript narrowing check
    if (result.header.typ === WIRE_02_JWS_TYP) {
      const h = result.header as Wire02JWSHeader;
      expect(h.typ).toBe(WIRE_02_JWS_TYP);
    } else {
      throw new Error('Expected Wire02JWSHeader');
    }
  });

  it('rejects kid that is empty', async () => {
    const { privateKey } = await generateKeypair();
    await expect(signWire02(wire02Payload, privateKey, '')).rejects.toThrow(CryptoError);
  });

  it('rejects kid that is 257 chars', async () => {
    const { privateKey } = await generateKeypair();
    const longKid = 'a'.repeat(257);
    await expect(signWire02(wire02Payload, privateKey, longKid)).rejects.toThrow(CryptoError);
  });

  it('accepts kid that is exactly 256 chars', async () => {
    const { privateKey, publicKey } = await generateKeypair();
    const maxKid = 'a'.repeat(256);
    const jws = await signWire02(wire02Payload, privateKey, maxKid);
    const result = await verify(jws, publicKey);
    expect(result.valid).toBe(true);
    expect(result.header.kid).toBe(maxKid);
  });
});

// ---------------------------------------------------------------------------
// typ normalization (Correction 2)
// ---------------------------------------------------------------------------

describe('typ normalization', () => {
  it('accepts application/interaction-record+jwt and normalizes to compact form', async () => {
    const { privateKey, publicKey } = await generateKeypair();

    // Manually craft a JWS with full media type form
    const rawHeader = { typ: 'application/interaction-record+jwt', alg: PEAC_ALG, kid: testKid };
    const headerB64 = Buffer.from(JSON.stringify(rawHeader)).toString('base64url');
    const payloadB64 = Buffer.from(JSON.stringify(wire02Payload)).toString('base64url');
    const sigInput = `${headerB64}.${payloadB64}`;

    // Sign the input bytes
    const { sign: ed25519Sign } = await import('../src/ed25519.js');
    const sigBytes = await ed25519Sign(new TextEncoder().encode(sigInput), privateKey);
    const jws = `${sigInput}.${Buffer.from(sigBytes).toString('base64url')}`;

    const result = await verify(jws, publicKey);
    expect(result.valid).toBe(true);
    // Returned header must use canonical compact form
    expect(result.header.typ).toBe(WIRE_02_JWS_TYP); // 'interaction-record+jwt'
    expect(result.header.typ).not.toBe('application/interaction-record+jwt');
  });

  it('decode() also normalizes full media type to compact form', () => {
    const rawHeader = { typ: 'application/interaction-record+jwt', alg: PEAC_ALG, kid: testKid };
    const headerB64 = Buffer.from(JSON.stringify(rawHeader)).toString('base64url');
    const payloadB64 = Buffer.from(JSON.stringify(wire02Payload)).toString('base64url');
    const jws = `${headerB64}.${payloadB64}.fakesig`;

    const decoded = decode(jws);
    expect(decoded.header.typ).toBe(WIRE_02_JWS_TYP);
  });
});

// ---------------------------------------------------------------------------
// UnTypedJWSHeader: absent typ pass-through (Correction 1)
// ---------------------------------------------------------------------------

describe('UnTypedJWSHeader: absent typ pass-through', () => {
  it('verify() returns UnTypedJWSHeader when typ is absent: no error from crypto', async () => {
    const { privateKey, publicKey } = await generateKeypair();

    // Craft JWS with no typ field
    const rawHeader = { alg: PEAC_ALG, kid: testKid };
    const headerB64 = Buffer.from(JSON.stringify(rawHeader)).toString('base64url');
    const payloadB64 = Buffer.from(JSON.stringify(wire02Payload)).toString('base64url');
    const sigInput = `${headerB64}.${payloadB64}`;

    const { sign: ed25519Sign } = await import('../src/ed25519.js');
    const sigBytes = await ed25519Sign(new TextEncoder().encode(sigInput), privateKey);
    const jws = `${sigInput}.${Buffer.from(sigBytes).toString('base64url')}`;

    const result = await verify(jws, publicKey);
    expect(result.valid).toBe(true);
    expect(result.header.typ).toBeUndefined();
    // TypeScript narrowing
    const h = result.header as UnTypedJWSHeader;
    expect(h.alg).toBe(PEAC_ALG);
  });

  it('decode() returns UnTypedJWSHeader when typ is absent', () => {
    const rawHeader = { alg: PEAC_ALG, kid: testKid };
    const headerB64 = Buffer.from(JSON.stringify(rawHeader)).toString('base64url');
    const payloadB64 = Buffer.from(JSON.stringify(wire02Payload)).toString('base64url');
    const jws = `${headerB64}.${payloadB64}.fakesig`;

    const decoded = decode(jws);
    expect(decoded.header.typ).toBeUndefined();
  });

  it('unrecognized typ (not Wire 0.1 or Wire 0.2) is a hard error from crypto', async () => {
    const { publicKey } = await generateKeypair();
    const rawHeader = { typ: 'com.other/unknown', alg: PEAC_ALG, kid: testKid };
    const headerB64 = Buffer.from(JSON.stringify(rawHeader)).toString('base64url');
    const payloadB64 = Buffer.from(JSON.stringify(wire02Payload)).toString('base64url');
    const jws = `${headerB64}.${payloadB64}.fakesig`;

    await expect(verify(jws, publicKey)).rejects.toThrow(CryptoError);
    await expect(verify(jws, publicKey)).rejects.toMatchObject({ code: 'CRYPTO_INVALID_TYP' });
  });
});

// ---------------------------------------------------------------------------
// Coherence checks: wire version consistency
// ---------------------------------------------------------------------------

describe('wire version coherence check', () => {
  it('typ=Wire02 + no peac_version in payload → CRYPTO_WIRE_VERSION_MISMATCH', async () => {
    const { privateKey, publicKey } = await generateKeypair();
    // Wire 0.1 payload but Wire 0.2 typ
    const wire01Payload = {
      iss: 'https://api.example.com',
      aud: 'https://app.example.com',
      iat: 1736934600,
    };
    const jws = await signWire02(wire01Payload, privateKey, testKid);

    await expect(verify(jws, publicKey)).rejects.toMatchObject({
      code: 'CRYPTO_WIRE_VERSION_MISMATCH',
    });
  });

  it('typ=Wire01 + peac_version:0.2 in payload → CRYPTO_WIRE_VERSION_MISMATCH', async () => {
    const { privateKey, publicKey } = await generateKeypair();
    // Wire 0.2 payload but Wire 0.1 typ
    const jws = await sign(wire02Payload, privateKey, testKid);

    await expect(verify(jws, publicKey)).rejects.toMatchObject({
      code: 'CRYPTO_WIRE_VERSION_MISMATCH',
    });
  });

  it('absent typ + peac_version:0.2 → no coherence check, returns UnTypedJWSHeader', async () => {
    const { privateKey, publicKey } = await generateKeypair();
    const rawHeader = { alg: PEAC_ALG, kid: testKid };
    const headerB64 = Buffer.from(JSON.stringify(rawHeader)).toString('base64url');
    const payloadB64 = Buffer.from(JSON.stringify(wire02Payload)).toString('base64url');
    const sigInput = `${headerB64}.${payloadB64}`;

    const { sign: ed25519Sign } = await import('../src/ed25519.js');
    const sigBytes = await ed25519Sign(new TextEncoder().encode(sigInput), privateKey);
    const jws = `${sigInput}.${Buffer.from(sigBytes).toString('base64url')}`;

    // Crypto layer must NOT throw: protocol layer handles this
    const result = await verify(jws, publicKey);
    expect(result.valid).toBe(true);
    expect(result.header.typ).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// JOSE hardening (validateWire02Header)
// ---------------------------------------------------------------------------

describe('validateWire02Header: JOSE hardening', () => {
  it('accepts a valid Wire 0.2 header', () => {
    expect(() =>
      validateWire02Header({ typ: WIRE_02_JWS_TYP, alg: PEAC_ALG, kid: testKid })
    ).not.toThrow();
  });

  it('rejects missing kid', () => {
    expect(() => validateWire02Header({ typ: WIRE_02_JWS_TYP, alg: PEAC_ALG })).toThrow(
      CryptoError
    );
    expect(() => validateWire02Header({ typ: WIRE_02_JWS_TYP, alg: PEAC_ALG })).toThrowError(
      expect.objectContaining({ code: 'CRYPTO_JWS_MISSING_KID' })
    );
  });

  it('rejects empty string kid', () => {
    expect(() =>
      validateWire02Header({ typ: WIRE_02_JWS_TYP, alg: PEAC_ALG, kid: '' })
    ).toThrowError(expect.objectContaining({ code: 'CRYPTO_JWS_MISSING_KID' }));
  });

  it('rejects kid of 257 chars', () => {
    expect(() =>
      validateWire02Header({ typ: WIRE_02_JWS_TYP, alg: PEAC_ALG, kid: 'a'.repeat(257) })
    ).toThrowError(expect.objectContaining({ code: 'CRYPTO_JWS_MISSING_KID' }));
  });

  it('accepts kid of exactly 256 chars', () => {
    expect(() =>
      validateWire02Header({ typ: WIRE_02_JWS_TYP, alg: PEAC_ALG, kid: 'a'.repeat(256) })
    ).not.toThrow();
  });

  it('rejects jwk embedded key', () => {
    expect(() =>
      validateWire02Header({ typ: WIRE_02_JWS_TYP, alg: PEAC_ALG, kid: testKid, jwk: {} })
    ).toThrowError(expect.objectContaining({ code: 'CRYPTO_JWS_EMBEDDED_KEY' }));
  });

  it('rejects x5c embedded key', () => {
    expect(() =>
      validateWire02Header({ typ: WIRE_02_JWS_TYP, alg: PEAC_ALG, kid: testKid, x5c: ['...'] })
    ).toThrowError(expect.objectContaining({ code: 'CRYPTO_JWS_EMBEDDED_KEY' }));
  });

  it('rejects x5u embedded key', () => {
    expect(() =>
      validateWire02Header({
        typ: WIRE_02_JWS_TYP,
        alg: PEAC_ALG,
        kid: testKid,
        x5u: 'https://example.com/cert',
      })
    ).toThrowError(expect.objectContaining({ code: 'CRYPTO_JWS_EMBEDDED_KEY' }));
  });

  it('rejects jku embedded key', () => {
    expect(() =>
      validateWire02Header({
        typ: WIRE_02_JWS_TYP,
        alg: PEAC_ALG,
        kid: testKid,
        jku: 'https://example.com/jwks',
      })
    ).toThrowError(expect.objectContaining({ code: 'CRYPTO_JWS_EMBEDDED_KEY' }));
  });

  it('rejects crit header', () => {
    expect(() =>
      validateWire02Header({ typ: WIRE_02_JWS_TYP, alg: PEAC_ALG, kid: testKid, crit: ['b64'] })
    ).toThrowError(expect.objectContaining({ code: 'CRYPTO_JWS_CRIT_REJECTED' }));
  });

  it('rejects b64:false (RFC 7797 unencoded payload)', () => {
    expect(() =>
      validateWire02Header({ typ: WIRE_02_JWS_TYP, alg: PEAC_ALG, kid: testKid, b64: false })
    ).toThrowError(expect.objectContaining({ code: 'CRYPTO_JWS_B64_REJECTED' }));
  });

  it('does NOT reject b64:true (only false is prohibited)', () => {
    expect(() =>
      validateWire02Header({ typ: WIRE_02_JWS_TYP, alg: PEAC_ALG, kid: testKid, b64: true })
    ).not.toThrow();
  });

  it('rejects zip header', () => {
    expect(() =>
      validateWire02Header({ typ: WIRE_02_JWS_TYP, alg: PEAC_ALG, kid: testKid, zip: 'DEF' })
    ).toThrowError(expect.objectContaining({ code: 'CRYPTO_JWS_ZIP_REJECTED' }));
  });
});

// ---------------------------------------------------------------------------
// JOSE hardening: verify() integration
//
// These tests prove that verify() itself enforces JOSE hardening: not just
// validateWire02Header() in isolation. Each test crafts a validly-signed JWS
// with a JOSE hazard and asserts that verify() rejects it.
// ---------------------------------------------------------------------------

describe('JOSE hardening: verify() rejects hazards in validly-signed JWS', () => {
  // Helper: build and sign a JWS with a custom header object
  async function signWithHeader(
    header: Record<string, unknown>,
    payload: unknown,
    privateKey: Uint8Array
  ): Promise<string> {
    const headerB64 = Buffer.from(JSON.stringify(header)).toString('base64url');
    const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const sigInput = `${headerB64}.${payloadB64}`;
    const { sign: ed25519Sign } = await import('../src/ed25519.js');
    const sigBytes = await ed25519Sign(new TextEncoder().encode(sigInput), privateKey);
    return `${sigInput}.${Buffer.from(sigBytes).toString('base64url')}`;
  }

  it('rejects Wire 0.2 JWS with b64:false: CRYPTO_JWS_B64_REJECTED', async () => {
    const { privateKey, publicKey } = await generateKeypair();
    const jws = await signWithHeader(
      { typ: WIRE_02_JWS_TYP, alg: PEAC_ALG, kid: testKid, b64: false },
      wire02Payload,
      privateKey
    );
    await expect(verify(jws, publicKey)).rejects.toMatchObject({
      code: 'CRYPTO_JWS_B64_REJECTED',
    });
  });

  it('rejects Wire 0.2 JWS with zip header: CRYPTO_JWS_ZIP_REJECTED', async () => {
    const { privateKey, publicKey } = await generateKeypair();
    const jws = await signWithHeader(
      { typ: WIRE_02_JWS_TYP, alg: PEAC_ALG, kid: testKid, zip: 'DEF' },
      wire02Payload,
      privateKey
    );
    await expect(verify(jws, publicKey)).rejects.toMatchObject({
      code: 'CRYPTO_JWS_ZIP_REJECTED',
    });
  });

  it('rejects Wire 0.2 JWS with crit header: CRYPTO_JWS_CRIT_REJECTED', async () => {
    const { privateKey, publicKey } = await generateKeypair();
    const jws = await signWithHeader(
      { typ: WIRE_02_JWS_TYP, alg: PEAC_ALG, kid: testKid, crit: ['b64'] },
      wire02Payload,
      privateKey
    );
    await expect(verify(jws, publicKey)).rejects.toMatchObject({
      code: 'CRYPTO_JWS_CRIT_REJECTED',
    });
  });

  it('rejects Wire 0.2 JWS with embedded jwk: CRYPTO_JWS_EMBEDDED_KEY', async () => {
    const { privateKey, publicKey } = await generateKeypair();
    const jws = await signWithHeader(
      { typ: WIRE_02_JWS_TYP, alg: PEAC_ALG, kid: testKid, jwk: { kty: 'OKP' } },
      wire02Payload,
      privateKey
    );
    await expect(verify(jws, publicKey)).rejects.toMatchObject({
      code: 'CRYPTO_JWS_EMBEDDED_KEY',
    });
  });

  it('rejects Wire 0.2 JWS with x5c: CRYPTO_JWS_EMBEDDED_KEY', async () => {
    const { privateKey, publicKey } = await generateKeypair();
    const jws = await signWithHeader(
      { typ: WIRE_02_JWS_TYP, alg: PEAC_ALG, kid: testKid, x5c: ['MIIBkTC...'] },
      wire02Payload,
      privateKey
    );
    await expect(verify(jws, publicKey)).rejects.toMatchObject({
      code: 'CRYPTO_JWS_EMBEDDED_KEY',
    });
  });

  // Interop bypass guard: absent typ does NOT bypass JOSE hardening
  it('rejects UnTyped JWS with b64:false: JOSE hardening applies regardless of absent typ', async () => {
    const { privateKey, publicKey } = await generateKeypair();
    const jws = await signWithHeader(
      { alg: PEAC_ALG, kid: testKid, b64: false },
      wire02Payload,
      privateKey
    );
    // No typ: normally would pass to protocol layer, but JOSE hazard must still be caught
    await expect(verify(jws, publicKey)).rejects.toMatchObject({
      code: 'CRYPTO_JWS_B64_REJECTED',
    });
  });

  it('rejects UnTyped JWS with embedded jwk: JOSE hardening applies regardless of absent typ', async () => {
    const { privateKey, publicKey } = await generateKeypair();
    const jws = await signWithHeader(
      { alg: PEAC_ALG, kid: testKid, jwk: { kty: 'OKP' } },
      wire02Payload,
      privateKey
    );
    await expect(verify(jws, publicKey)).rejects.toMatchObject({
      code: 'CRYPTO_JWS_EMBEDDED_KEY',
    });
  });

  it('does NOT apply JOSE hardening to Wire 0.1 JWS (backwards compat)', async () => {
    // Wire 0.1 predates JOSE hardening constraints; verify() must not break existing tokens.
    // sign() only sets {typ, alg, kid} so this is an academic test but confirms no regression.
    const { privateKey, publicKey } = await generateKeypair();
    const wire01Payload = {
      iss: 'https://api.example.com',
      aud: 'https://app.example.com',
      iat: 1736934600,
      rid: 'test-rid-001',
      amt: 100,
      cur: 'USD',
    };
    const jws = await signWithHeader(
      { typ: WIRE_01_JWS_TYP, alg: PEAC_ALG, kid: testKid },
      wire01Payload,
      privateKey
    );
    const result = await verify(jws, publicKey);
    expect(result.valid).toBe(true);
    expect(result.header.typ).toBe(WIRE_01_JWS_TYP);
  });
});

// ---------------------------------------------------------------------------
// Wire 0.1 regression: existing sign/verify still works
// ---------------------------------------------------------------------------

describe('Wire 0.1 regression', () => {
  const wire01Payload = {
    iss: 'https://api.example.com',
    aud: 'https://app.example.com',
    iat: 1736934600,
    rid: 'test-rid-001',
    amt: 100,
    cur: 'USD',
  };

  it('sign() still produces Wire 0.1 JWS with correct typ', async () => {
    const { privateKey, publicKey } = await generateKeypair();
    const jws = await sign(wire01Payload, privateKey, testKid);

    const result = await verify(jws, publicKey);
    expect(result.valid).toBe(true);
    expect(result.header.typ).toBe(WIRE_01_JWS_TYP);
  });

  it('Wire 0.1 and Wire 0.2 JWS coexist and verify independently', async () => {
    const { privateKey, publicKey } = await generateKeypair();
    const jws01 = await sign(wire01Payload, privateKey, testKid);
    const jws02 = await signWire02(wire02Payload, privateKey, testKid);

    const result01 = await verify(jws01, publicKey);
    const result02 = await verify(jws02, publicKey);

    expect(result01.valid).toBe(true);
    expect(result01.header.typ).toBe(WIRE_01_JWS_TYP);

    expect(result02.valid).toBe(true);
    expect(result02.header.typ).toBe(WIRE_02_JWS_TYP);
  });

  it('Wire01JWSHeader type narrows correctly', async () => {
    const { privateKey, publicKey } = await generateKeypair();
    const jws = await sign(wire01Payload, privateKey, testKid);
    const result = await verify(jws, publicKey);

    expect(result.header.typ).toBe(WIRE_01_JWS_TYP);
    const h = result.header as Wire01JWSHeader;
    expect(h.typ).toBe(WIRE_01_JWS_TYP);
  });
});
