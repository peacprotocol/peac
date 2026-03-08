/**
 * Wire 0.2 issuance + verification tests (v0.12.0-preview.1, DD-156)
 *
 * Tests: issueWire02(), verifyLocal() Wire 0.2 path, strictness profiles (strict/interop),
 * iss canonical validation, did: iss acceptance, occurred_at skew rules,
 * Wire 0.1 regression, isWire02Result() type guard.
 */

import { describe, it, expect } from 'vitest';
import { generateKeypair, sign } from '@peac/crypto';
import { WIRE_02_JWS_TYP, PEAC_ALG } from '@peac/kernel';
import { WARNING_TYP_MISSING, WARNING_OCCURRED_AT_SKEW } from '@peac/schema';
import { issueWire02, issueWire01, verifyLocal, isWire02Result } from '../src/index';
import { verifyLocalWire01 } from '../src/verify-local-wire01';

// ---------------------------------------------------------------------------
// Helper: create a valid-signature JWS with custom header fields (JOSE hazard injection)
//
// Used to test that verifyLocal() returns specific E_JWS_* codes for JOSE violations
// (not the generic E_INVALID_FORMAT). Same PKCS8 encoding technique as createUntypedJWS.
// ---------------------------------------------------------------------------
async function createJWSWithHazard(
  payload: unknown,
  privateKeyBytes: Uint8Array,
  kid: string,
  headerExtra: Record<string, unknown>
): Promise<string> {
  const rawHeader = { typ: WIRE_02_JWS_TYP, alg: PEAC_ALG, kid, ...headerExtra };
  const headerB64 = Buffer.from(JSON.stringify(rawHeader)).toString('base64url');
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signingInput = `${headerB64}.${payloadB64}`;

  const pkcs8 = new Uint8Array(48);
  pkcs8.set(
    [
      0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x04, 0x22, 0x04,
      0x20,
    ],
    0
  );
  pkcs8.set(privateKeyBytes, 16);

  const cryptoKey = await crypto.subtle.importKey('pkcs8', pkcs8, { name: 'Ed25519' }, false, [
    'sign',
  ]);
  const sigBytes = await crypto.subtle.sign(
    { name: 'Ed25519' },
    cryptoKey,
    new TextEncoder().encode(signingInput)
  );

  return `${signingInput}.${Buffer.from(sigBytes).toString('base64url')}`;
}

// ---------------------------------------------------------------------------
// Helper: create a valid-signature JWS with no typ field
//
// Used to test strictness routing (strict mode: hard error; interop mode: warning).
// Uses Node.js built-in crypto.subtle (Ed25519 is RFC 8032; interoperable with
// @noble/ed25519 which also follows RFC 8032).
//
// PKCS8 encoding for Ed25519 private key (OneAsymmetricKey, RFC 5958):
//   SEQUENCE(46) { INTEGER 0, SEQUENCE { OID 1.3.101.112 }, OCTET STRING { OCTET STRING(32 bytes) } }
// Byte prefix: 30 2e 02 01 00 30 05 06 03 2b 65 70 04 22 04 20 [32 raw bytes]
// ---------------------------------------------------------------------------
async function createUntypedJWS(
  payload: unknown,
  privateKeyBytes: Uint8Array,
  kid: string
): Promise<string> {
  const rawHeader = { alg: PEAC_ALG, kid };
  const headerB64 = Buffer.from(JSON.stringify(rawHeader)).toString('base64url');
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signingInput = `${headerB64}.${payloadB64}`;

  // Encode 32-byte raw private key as Ed25519 PKCS8 DER
  const pkcs8 = new Uint8Array(48);
  pkcs8.set(
    [
      0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x04, 0x22, 0x04,
      0x20,
    ],
    0
  );
  pkcs8.set(privateKeyBytes, 16);

  const cryptoKey = await crypto.subtle.importKey('pkcs8', pkcs8, { name: 'Ed25519' }, false, [
    'sign',
  ]);
  const sigBytes = await crypto.subtle.sign(
    { name: 'Ed25519' },
    cryptoKey,
    new TextEncoder().encode(signingInput)
  );

  return `${signingInput}.${Buffer.from(sigBytes).toString('base64url')}`;
}

// Shared test constants
const testKid = '2026-01-15T10:30:00Z';
const testIss = 'https://api.example.com';
const testType = 'org.peacprotocol/payment';

// ---------------------------------------------------------------------------
// issueWire02(): basic output shape
// ---------------------------------------------------------------------------

describe('issueWire02() basic output', () => {
  it('returns a JWS with three dot-separated parts', async () => {
    const { privateKey } = await generateKeypair();
    const { jws } = await issueWire02({
      iss: testIss,
      kind: 'evidence',
      type: testType,
      privateKey,
      kid: testKid,
    });
    expect(jws.split('.')).toHaveLength(3);
  });

  it('header contains typ: interaction-record+jwt', async () => {
    const { privateKey } = await generateKeypair();
    const { jws } = await issueWire02({
      iss: testIss,
      kind: 'evidence',
      type: testType,
      privateKey,
      kid: testKid,
    });
    const parts = jws.split('.');
    const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString());
    expect(header.typ).toBe(WIRE_02_JWS_TYP);
  });

  it('always sets typ: no code path omits it (MUST per spec)', async () => {
    const { privateKey } = await generateKeypair();
    const { jws } = await issueWire02({
      iss: testIss,
      kind: 'challenge',
      type: 'org.peacprotocol/payment',
      privateKey,
      kid: testKid,
    });
    const parts = jws.split('.');
    const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString());
    expect(header.typ).toBe(WIRE_02_JWS_TYP);
    expect(header.typ).not.toBeUndefined();
  });

  it('payload contains peac_version: 0.2', async () => {
    const { privateKey } = await generateKeypair();
    const { jws } = await issueWire02({
      iss: testIss,
      kind: 'evidence',
      type: testType,
      privateKey,
      kid: testKid,
    });
    const parts = jws.split('.');
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
    expect(payload.peac_version).toBe('0.2');
  });

  it('generates a jti if not provided', async () => {
    const { privateKey } = await generateKeypair();
    const { jws } = await issueWire02({
      iss: testIss,
      kind: 'evidence',
      type: testType,
      privateKey,
      kid: testKid,
    });
    const parts = jws.split('.');
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
    expect(typeof payload.jti).toBe('string');
    expect(payload.jti.length).toBeGreaterThan(0);
  });

  it('uses caller-provided jti if supplied', async () => {
    const { privateKey } = await generateKeypair();
    const customJti = 'my-custom-jti-001';
    const { jws } = await issueWire02({
      iss: testIss,
      kind: 'evidence',
      type: testType,
      privateKey,
      kid: testKid,
      jti: customJti,
    });
    const parts = jws.split('.');
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
    expect(payload.jti).toBe(customJti);
  });
});

// ---------------------------------------------------------------------------
// issueWire02(): iss canonical validation
// ---------------------------------------------------------------------------

describe('issueWire02() iss canonical validation', () => {
  it('accepts https:// ASCII origin', async () => {
    const { privateKey } = await generateKeypair();
    await expect(
      issueWire02({
        iss: 'https://api.example.com',
        kind: 'evidence',
        type: testType,
        privateKey,
        kid: testKid,
      })
    ).resolves.toBeDefined();
  });

  it('accepts https:// with non-standard port', async () => {
    const { privateKey } = await generateKeypair();
    await expect(
      issueWire02({
        iss: 'https://api.example.com:8443',
        kind: 'evidence',
        type: testType,
        privateKey,
        kid: testKid,
      })
    ).resolves.toBeDefined();
  });

  it('accepts did:web: identifier', async () => {
    const { privateKey } = await generateKeypair();
    await expect(
      issueWire02({
        iss: 'did:web:example.com',
        kind: 'evidence',
        type: testType,
        privateKey,
        kid: testKid,
      })
    ).resolves.toBeDefined();
  });

  it('accepts did:key: identifier', async () => {
    const { privateKey } = await generateKeypair();
    await expect(
      issueWire02({
        iss: 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK',
        kind: 'evidence',
        type: testType,
        privateKey,
        kid: testKid,
      })
    ).resolves.toBeDefined();
  });

  it('rejects http:// (non-HTTPS)', async () => {
    const { privateKey } = await generateKeypair();
    await expect(
      issueWire02({
        iss: 'http://api.example.com',
        kind: 'evidence',
        type: testType,
        privateKey,
        kid: testKid,
      })
    ).rejects.toThrow(/not in canonical form/);
  });

  it('rejects https:// with default port :443', async () => {
    const { privateKey } = await generateKeypair();
    await expect(
      issueWire02({
        iss: 'https://api.example.com:443',
        kind: 'evidence',
        type: testType,
        privateKey,
        kid: testKid,
      })
    ).rejects.toThrow(/not in canonical form/);
  });

  it('rejects https:// with trailing slash', async () => {
    const { privateKey } = await generateKeypair();
    await expect(
      issueWire02({
        iss: 'https://api.example.com/',
        kind: 'evidence',
        type: testType,
        privateKey,
        kid: testKid,
      })
    ).rejects.toThrow(/not in canonical form/);
  });

  it('rejects https:// with path', async () => {
    const { privateKey } = await generateKeypair();
    await expect(
      issueWire02({
        iss: 'https://api.example.com/v1',
        kind: 'evidence',
        type: testType,
        privateKey,
        kid: testKid,
      })
    ).rejects.toThrow(/not in canonical form/);
  });

  it('rejects did: with fragment', async () => {
    const { privateKey } = await generateKeypair();
    await expect(
      issueWire02({
        iss: 'did:web:example.com#key-1',
        kind: 'evidence',
        type: testType,
        privateKey,
        kid: testKid,
      })
    ).rejects.toThrow(/not in canonical form/);
  });

  it('rejects bare domain (no scheme)', async () => {
    const { privateKey } = await generateKeypair();
    await expect(
      issueWire02({
        iss: 'example.com',
        kind: 'evidence',
        type: testType,
        privateKey,
        kid: testKid,
      })
    ).rejects.toThrow(/not in canonical form/);
  });
});

// ---------------------------------------------------------------------------
// Round-trip: issueWire02 → verifyLocal
// ---------------------------------------------------------------------------

describe('issueWire02 → verifyLocal round-trip', () => {
  it('round-trip succeeds with variant: wire-02 and wireVersion: 0.2', async () => {
    const { privateKey, publicKey } = await generateKeypair();
    const { jws } = await issueWire02({
      iss: testIss,
      kind: 'evidence',
      type: testType,
      privateKey,
      kid: testKid,
    });

    const result = await verifyLocal(jws, publicKey);

    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.variant).toBe('wire-02');
      expect(result.wireVersion).toBe('0.2');
      expect(result.warnings).toEqual([]);
      expect(result.policy_binding).toBe('unavailable');
    }
  });

  it('round-trip returns correct claims fields', async () => {
    const { privateKey, publicKey } = await generateKeypair();
    const customJti = 'rtt-jti-001';
    const { jws } = await issueWire02({
      iss: testIss,
      kind: 'evidence',
      type: testType,
      jti: customJti,
      sub: 'https://resource.example.com/item/1',
      privateKey,
      kid: testKid,
    });

    const result = await verifyLocal(jws, publicKey);

    expect(result.valid).toBe(true);
    if (result.valid && result.variant === 'wire-02') {
      expect(result.claims.peac_version).toBe('0.2');
      expect(result.claims.kind).toBe('evidence');
      expect(result.claims.type).toBe(testType);
      expect(result.claims.iss).toBe(testIss);
      expect(result.claims.jti).toBe(customJti);
      expect(result.claims.sub).toBe('https://resource.example.com/item/1');
      expect(typeof result.claims.iat).toBe('number');
    }
  });

  it('round-trip with challenge kind succeeds', async () => {
    const { privateKey, publicKey } = await generateKeypair();
    const { jws } = await issueWire02({
      iss: testIss,
      kind: 'challenge',
      type: 'org.peacprotocol/payment',
      privateKey,
      kid: testKid,
    });

    const result = await verifyLocal(jws, publicKey);

    expect(result.valid).toBe(true);
    if (result.valid && result.variant === 'wire-02') {
      expect(result.claims.kind).toBe('challenge');
    }
  });

  it('round-trip with sorted pillars succeeds', async () => {
    const { privateKey, publicKey } = await generateKeypair();
    const { jws } = await issueWire02({
      iss: testIss,
      kind: 'evidence',
      type: testType,
      pillars: ['access', 'commerce'],
      privateKey,
      kid: testKid,
    });

    const result = await verifyLocal(jws, publicKey);

    expect(result.valid).toBe(true);
    if (result.valid && result.variant === 'wire-02') {
      expect(result.claims.pillars).toEqual(['access', 'commerce']);
    }
  });

  it('issuer binding check: rejects wrong issuer', async () => {
    const { privateKey, publicKey } = await generateKeypair();
    const { jws } = await issueWire02({
      iss: testIss,
      kind: 'evidence',
      type: testType,
      privateKey,
      kid: testKid,
    });

    const result = await verifyLocal(jws, publicKey, { issuer: 'https://other.example.com' });

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.code).toBe('E_INVALID_ISSUER');
    }
  });

  it('wrong public key produces E_INVALID_SIGNATURE', async () => {
    const { privateKey } = await generateKeypair();
    const { publicKey: wrongPublicKey } = await generateKeypair();
    const { jws } = await issueWire02({
      iss: testIss,
      kind: 'evidence',
      type: testType,
      privateKey,
      kid: testKid,
    });

    const result = await verifyLocal(jws, wrongPublicKey);

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.code).toBe('E_INVALID_SIGNATURE');
    }
  });
});

// ---------------------------------------------------------------------------
// did: iss: verifyLocal accepts same publicKey: Uint8Array (no DID auto-resolution)
// ---------------------------------------------------------------------------

describe('did: iss acceptance (no DID auto-resolution)', () => {
  it('did:web iss: round-trip succeeds with caller-provided publicKey', async () => {
    const { privateKey, publicKey } = await generateKeypair();
    const didIss = 'did:web:example.com';
    const { jws } = await issueWire02({
      iss: didIss,
      kind: 'evidence',
      type: testType,
      privateKey,
      kid: testKid,
    });

    // verifyLocal uses the same publicKey: Uint8Array call signature as https:// iss
    // No DID document resolution happens; caller always provides the key
    const result = await verifyLocal(jws, publicKey);

    expect(result.valid).toBe(true);
    if (result.valid && result.variant === 'wire-02') {
      expect(result.claims.iss).toBe(didIss);
    }
  });

  it('did:key iss: round-trip succeeds with caller-provided publicKey', async () => {
    const { privateKey, publicKey } = await generateKeypair();
    const didIss = 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK';
    const { jws } = await issueWire02({
      iss: didIss,
      kind: 'evidence',
      type: testType,
      privateKey,
      kid: testKid,
    });

    const result = await verifyLocal(jws, publicKey);

    expect(result.valid).toBe(true);
    if (result.valid && result.variant === 'wire-02') {
      expect(result.claims.iss).toBe(didIss);
    }
  });

  it('did: and https:// iss use identical verifyLocal call signature', async () => {
    const { privateKey, publicKey } = await generateKeypair();
    const httpsJws = (
      await issueWire02({
        iss: testIss,
        kind: 'evidence',
        type: testType,
        privateKey,
        kid: testKid,
      })
    ).jws;
    const didJws = (
      await issueWire02({
        iss: 'did:web:example.com',
        kind: 'evidence',
        type: testType,
        privateKey,
        kid: testKid,
      })
    ).jws;

    // Same call signature: verifyLocal(jws, publicKey): no special DID parameter
    const httpsResult = await verifyLocal(httpsJws, publicKey);
    const didResult = await verifyLocal(didJws, publicKey);

    expect(httpsResult.valid).toBe(true);
    expect(didResult.valid).toBe(true);
    if (httpsResult.valid && didResult.valid) {
      expect(httpsResult.variant).toBe('wire-02');
      expect(didResult.variant).toBe('wire-02');
    }
  });
});

// ---------------------------------------------------------------------------
// Strictness profiles: strict (default) vs interop
// ---------------------------------------------------------------------------

describe('strictness: strict mode (default)', () => {
  it('missing typ in JWS header → E_INVALID_FORMAT in strict mode (default)', async () => {
    const { privateKey, publicKey } = await generateKeypair();
    const wire02Payload = {
      peac_version: '0.2',
      kind: 'evidence',
      type: testType,
      iss: testIss,
      iat: Math.floor(Date.now() / 1000),
      jti: 'strictness-test-001',
    };
    const jws = await createUntypedJWS(wire02Payload, privateKey, testKid);

    // strict mode (default): should reject missing typ
    const result = await verifyLocal(jws, publicKey);

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.code).toBe('E_INVALID_FORMAT');
      expect(result.message).toContain('strict');
    }
  });

  it('missing typ → E_INVALID_FORMAT when strictness explicitly set to strict', async () => {
    const { privateKey, publicKey } = await generateKeypair();
    const wire02Payload = {
      peac_version: '0.2',
      kind: 'evidence',
      type: testType,
      iss: testIss,
      iat: Math.floor(Date.now() / 1000),
      jti: 'strictness-test-002',
    };
    const jws = await createUntypedJWS(wire02Payload, privateKey, testKid);

    const result = await verifyLocal(jws, publicKey, { strictness: 'strict' });

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.code).toBe('E_INVALID_FORMAT');
    }
  });

  it('unrecognized typ present → hard error even in strict mode (crypto layer rejects)', async () => {
    const { publicKey } = await generateKeypair();
    // Manually create JWS with unrecognized typ (not Wire 0.1 or Wire 0.2)
    const badHeader = { typ: 'com.other/unknown-format', alg: PEAC_ALG, kid: testKid };
    const wire02Payload = {
      peac_version: '0.2',
      kind: 'evidence',
      type: testType,
      iss: testIss,
      iat: Math.floor(Date.now() / 1000),
      jti: 'strictness-test-003',
    };
    const headerB64 = Buffer.from(JSON.stringify(badHeader)).toString('base64url');
    const payloadB64 = Buffer.from(JSON.stringify(wire02Payload)).toString('base64url');
    const jws = `${headerB64}.${payloadB64}.fakesig`;

    // Crypto layer throws E_INVALID_FORMAT for unrecognized typ (not a signature check)
    const result = await verifyLocal(jws, publicKey);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.code).toBe('E_INVALID_FORMAT');
    }
  });
});

describe('strictness: interop mode', () => {
  it('missing typ + valid Wire 0.2 payload → success with typ_missing warning', async () => {
    const { privateKey, publicKey } = await generateKeypair();
    const wire02Payload = {
      peac_version: '0.2',
      kind: 'evidence',
      type: testType,
      iss: testIss,
      iat: Math.floor(Date.now() / 1000),
      jti: 'interop-test-001',
    };
    const jws = await createUntypedJWS(wire02Payload, privateKey, testKid);

    const result = await verifyLocal(jws, publicKey, { strictness: 'interop' });

    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.variant).toBe('wire-02');
      expect(result.wireVersion).toBe('0.2');
      expect(result.warnings).toEqual(
        expect.arrayContaining([expect.objectContaining({ code: WARNING_TYP_MISSING })])
      );
    }
  });

  it('interop mode: unrecognized typ present → hard error (crypto layer rejects, not strictness)', async () => {
    const { publicKey } = await generateKeypair();
    const badHeader = { typ: 'com.other/unknown-format', alg: PEAC_ALG, kid: testKid };
    const wire02Payload = {
      peac_version: '0.2',
      kind: 'evidence',
      type: testType,
      iss: testIss,
      iat: Math.floor(Date.now() / 1000),
      jti: 'interop-test-002',
    };
    const headerB64 = Buffer.from(JSON.stringify(badHeader)).toString('base64url');
    const payloadB64 = Buffer.from(JSON.stringify(wire02Payload)).toString('base64url');
    const jws = `${headerB64}.${payloadB64}.fakesig`;

    // Even in interop mode, unrecognized (but present) typ is a hard error
    const result = await verifyLocal(jws, publicKey, { strictness: 'interop' });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.code).toBe('E_INVALID_FORMAT');
    }
  });

  it('interop mode: missing typ returns correct claims', async () => {
    const { privateKey, publicKey } = await generateKeypair();
    const customJti = 'interop-jti-003';
    const wire02Payload = {
      peac_version: '0.2',
      kind: 'evidence',
      type: testType,
      iss: testIss,
      iat: Math.floor(Date.now() / 1000),
      jti: customJti,
    };
    const jws = await createUntypedJWS(wire02Payload, privateKey, testKid);

    const result = await verifyLocal(jws, publicKey, { strictness: 'interop' });

    expect(result.valid).toBe(true);
    if (result.valid && result.variant === 'wire-02') {
      expect(result.claims.peac_version).toBe('0.2');
      expect(result.claims.kind).toBe('evidence');
      expect(result.claims.jti).toBe(customJti);
    }
  });
});

// ---------------------------------------------------------------------------
// occurred_at skew rules (evidence kind only, Correction 5, DD-156)
// ---------------------------------------------------------------------------

describe('occurred_at skew rules', () => {
  it('occurred_at ≤ iat: valid, no warning', async () => {
    const { privateKey, publicKey } = await generateKeypair();
    const baseTime = Math.floor(Date.now() / 1000);
    // occurred_at = baseTime - 60 (before iat)
    const occurredAt = new Date((baseTime - 60) * 1000).toISOString();

    const { jws } = await issueWire02({
      iss: testIss,
      kind: 'evidence',
      type: testType,
      occurred_at: occurredAt,
      privateKey,
      kid: testKid,
    });

    const result = await verifyLocal(jws, publicKey, { now: baseTime });

    expect(result.valid).toBe(true);
    if (result.valid && result.variant === 'wire-02') {
      expect(result.warnings.some((w) => w.code === WARNING_OCCURRED_AT_SKEW)).toBe(false);
    }
  });

  it('occurred_at > iat but within tolerance: produces occurred_at_skew warning', async () => {
    const { privateKey, publicKey } = await generateKeypair();
    const baseTime = Math.floor(Date.now() / 1000);
    // occurred_at = baseTime + 60 (after iat, within 300s tolerance)
    const occurredAt = new Date((baseTime + 60) * 1000).toISOString();

    const { jws } = await issueWire02({
      iss: testIss,
      kind: 'evidence',
      type: testType,
      occurred_at: occurredAt,
      privateKey,
      kid: testKid,
    });

    // Verify with now = baseTime so occurred_at (baseTime+60) > iat (≈baseTime) but ≤ now+300
    const result = await verifyLocal(jws, publicKey, { now: baseTime });

    expect(result.valid).toBe(true);
    if (result.valid && result.variant === 'wire-02') {
      const skewWarning = result.warnings.find((w) => w.code === WARNING_OCCURRED_AT_SKEW);
      expect(skewWarning).toBeDefined();
      expect(skewWarning?.pointer).toBe('/occurred_at');
    }
  });

  it('occurred_at > now + tolerance: E_OCCURRED_AT_FUTURE hard error', async () => {
    const { privateKey, publicKey } = await generateKeypair();
    const baseTime = Math.floor(Date.now() / 1000);
    // occurred_at = baseTime + 400 (beyond 300s tolerance)
    const occurredAt = new Date((baseTime + 400) * 1000).toISOString();

    const { jws } = await issueWire02({
      iss: testIss,
      kind: 'evidence',
      type: testType,
      occurred_at: occurredAt,
      privateKey,
      kid: testKid,
    });

    const result = await verifyLocal(jws, publicKey, { now: baseTime });

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.code).toBe('E_OCCURRED_AT_FUTURE');
    }
  });

  it('occurred_at on challenge kind: rejected by schema (E_OCCURRED_AT_ON_CHALLENGE)', async () => {
    const { privateKey } = await generateKeypair();
    const occurredAt = new Date().toISOString();

    await expect(
      issueWire02({
        iss: testIss,
        kind: 'challenge',
        type: 'org.peacprotocol/payment',
        occurred_at: occurredAt,
        privateKey,
        kid: testKid,
      })
    ).rejects.toThrow(/schema validation failed/i);
  });

  it('occurred_at absent: no skew check, no warning', async () => {
    const { privateKey, publicKey } = await generateKeypair();
    const { jws } = await issueWire02({
      iss: testIss,
      kind: 'evidence',
      type: testType,
      // no occurred_at
      privateKey,
      kid: testKid,
    });

    const result = await verifyLocal(jws, publicKey);

    expect(result.valid).toBe(true);
    if (result.valid && result.variant === 'wire-02') {
      expect(result.warnings.some((w) => w.code === WARNING_OCCURRED_AT_SKEW)).toBe(false);
    }
  });

  it('occurred_at skew: challenge kind skips the check entirely', async () => {
    // Challenge kind: occurred_at is forbidden by schema, so this tests schema enforcement
    // This test verifies occurred_at=undefined on challenge produces no warnings
    const { privateKey, publicKey } = await generateKeypair();
    const { jws } = await issueWire02({
      iss: testIss,
      kind: 'challenge',
      type: 'org.peacprotocol/payment',
      privateKey,
      kid: testKid,
    });

    const result = await verifyLocal(jws, publicKey);

    expect(result.valid).toBe(true);
    if (result.valid && result.variant === 'wire-02') {
      expect(result.warnings).toEqual([]);
    }
  });
});

// ---------------------------------------------------------------------------
// Wire 0.1 regression: existing receipts have wireVersion: '0.1' and warnings: []
// ---------------------------------------------------------------------------

describe('Wire 0.1 isolation', () => {
  const issueOpts = {
    iss: 'https://api.example.com',
    aud: 'https://client.example.com',
    amt: 1000,
    cur: 'USD',
    rail: 'x402',
    reference: 'tx_abc123',
    asset: 'USD',
    env: 'test' as const,
    evidence: {},
  };

  it('verifyLocal() rejects Wire 0.1 with E_UNSUPPORTED_WIRE_VERSION', async () => {
    const { privateKey, publicKey } = await generateKeypair();
    const { jws } = await issueWire01({ ...issueOpts, privateKey, kid: testKid });

    const result = await verifyLocal(jws, publicKey);

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.code).toBe('E_UNSUPPORTED_WIRE_VERSION');
      expect(result.message).toContain('Wire 0.1');
    }
  });

  it('verifyLocalWire01(): commerce receipt verifies with wireVersion 0.1', async () => {
    const { privateKey, publicKey } = await generateKeypair();
    const { jws } = await issueWire01({ ...issueOpts, privateKey, kid: testKid });

    const result = await verifyLocalWire01(jws, publicKey);

    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.variant).toBe('commerce');
      expect(result.wireVersion).toBe('0.1');
      expect(result.warnings).toEqual([]);
      expect(result.policy_binding).toBe('unavailable');
    }
  });

  it('verifyLocalWire01(): manually signed Wire 0.1 JWS verifies', async () => {
    const { privateKey, publicKey } = await generateKeypair();
    const payload = {
      iss: 'https://api.example.com',
      aud: 'https://client.example.com',
      iat: Math.floor(Date.now() / 1000),
      rid: '01234567-0123-7123-8123-0123456789ab',
      amt: 1000,
      cur: 'USD',
      payment: { rail: 'x402', reference: 'tx_001', amount: 1000, currency: 'USD' },
    };
    const jws = await sign(payload, privateKey, testKid);

    const result = await verifyLocalWire01(jws, publicKey);

    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.variant).toBe('commerce');
      expect(result.wireVersion).toBe('0.1');
      expect(result.warnings).toEqual([]);
    }
  });

  it('verifyLocal() accepts Wire 0.2, rejects Wire 0.1', async () => {
    const { privateKey, publicKey } = await generateKeypair();
    const { jws: jws01 } = await issueWire01({ ...issueOpts, privateKey, kid: testKid });
    const { jws: jws02 } = await issueWire02({
      iss: testIss,
      kind: 'evidence',
      type: testType,
      privateKey,
      kid: testKid,
    });

    const result01 = await verifyLocal(jws01, publicKey);
    const result02 = await verifyLocal(jws02, publicKey);

    expect(result01.valid).toBe(false);
    if (!result01.valid) {
      expect(result01.code).toBe('E_UNSUPPORTED_WIRE_VERSION');
    }
    expect(result02.valid).toBe(true);
    if (result02.valid) {
      expect(result02.wireVersion).toBe('0.2');
    }
  });
});

// ---------------------------------------------------------------------------
// isWire02Result() type guard
// ---------------------------------------------------------------------------

describe('isWire02Result() type guard', () => {
  it('returns true for a wire-02 success result', async () => {
    const { privateKey, publicKey } = await generateKeypair();
    const { jws } = await issueWire02({
      iss: testIss,
      kind: 'evidence',
      type: testType,
      privateKey,
      kid: testKid,
    });
    const result = await verifyLocal(jws, publicKey);

    expect(isWire02Result(result)).toBe(true);
  });

  it('returns false for a commerce result', async () => {
    const { privateKey, publicKey } = await generateKeypair();
    const { jws } = await issueWire01({
      iss: 'https://api.example.com',
      aud: 'https://client.example.com',
      amt: 100,
      cur: 'USD',
      rail: 'x402',
      reference: 'tx_001',
      privateKey,
      kid: testKid,
    });
    const result = await verifyLocal(jws, publicKey);

    expect(isWire02Result(result)).toBe(false);
  });

  it('returns false for a failed verification', async () => {
    const { publicKey } = await generateKeypair();
    const result = await verifyLocal('invalid.jws.format', publicKey);

    expect(isWire02Result(result)).toBe(false);
  });

  it('type guard allows accessing Wire 0.2 claims without cast', async () => {
    const { privateKey, publicKey } = await generateKeypair();
    const { jws } = await issueWire02({
      iss: testIss,
      kind: 'evidence',
      type: testType,
      pillars: ['access', 'commerce'],
      privateKey,
      kid: testKid,
    });
    const result = await verifyLocal(jws, publicKey);

    if (isWire02Result(result)) {
      // TypeScript should allow accessing Wire 0.2 specific fields without cast
      expect(result.claims.kind).toBe('evidence');
      expect(result.claims.peac_version).toBe('0.2');
      expect(result.claims.pillars).toEqual(['access', 'commerce']);
      expect(result.kid).toBe(testKid);
    } else {
      throw new Error('Expected wire-02 result');
    }
  });
});

// ---------------------------------------------------------------------------
// JOSE error code mapping: verifyLocal() returns specific E_JWS_* codes
//
// Proves the CRYPTO_JWS_* → E_JWS_* mapping in verify-local.ts is wired correctly.
// Each test crafts a validly-signed Wire 0.2 JWS with a JOSE hazard and asserts the
// specific public error code (not the generic E_INVALID_FORMAT).
// ---------------------------------------------------------------------------

describe('verifyLocal() JOSE error code mapping (not generic E_INVALID_FORMAT)', () => {
  const wire02JosePayload = {
    peac_version: '0.2',
    kind: 'evidence' as const,
    type: testType,
    iss: testIss,
    iat: Math.floor(Date.now() / 1000),
    jti: 'jose-mapping-test',
  };

  it('b64:false → E_JWS_B64_REJECTED', async () => {
    const { privateKey, publicKey } = await generateKeypair();
    const jws = await createJWSWithHazard(wire02JosePayload, privateKey, testKid, {
      b64: false,
    });
    const result = await verifyLocal(jws, publicKey);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.code).toBe('E_JWS_B64_REJECTED');
    }
  });

  it('zip → E_JWS_ZIP_REJECTED', async () => {
    const { privateKey, publicKey } = await generateKeypair();
    const jws = await createJWSWithHazard(wire02JosePayload, privateKey, testKid, {
      zip: 'DEF',
    });
    const result = await verifyLocal(jws, publicKey);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.code).toBe('E_JWS_ZIP_REJECTED');
    }
  });

  it('crit → E_JWS_CRIT_REJECTED', async () => {
    const { privateKey, publicKey } = await generateKeypair();
    const jws = await createJWSWithHazard(wire02JosePayload, privateKey, testKid, {
      crit: ['b64'],
    });
    const result = await verifyLocal(jws, publicKey);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.code).toBe('E_JWS_CRIT_REJECTED');
    }
  });

  it('jwk embedded key → E_JWS_EMBEDDED_KEY', async () => {
    const { privateKey, publicKey } = await generateKeypair();
    const jws = await createJWSWithHazard(wire02JosePayload, privateKey, testKid, {
      jwk: { kty: 'OKP', crv: 'Ed25519' },
    });
    const result = await verifyLocal(jws, publicKey);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.code).toBe('E_JWS_EMBEDDED_KEY');
    }
  });

  it('x5c embedded key → E_JWS_EMBEDDED_KEY', async () => {
    const { privateKey, publicKey } = await generateKeypair();
    const jws = await createJWSWithHazard(wire02JosePayload, privateKey, testKid, {
      x5c: ['MIIBkTC...'],
    });
    const result = await verifyLocal(jws, publicKey);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.code).toBe('E_JWS_EMBEDDED_KEY');
    }
  });

  it('interop mode: missing typ + JOSE hazard (b64:false) still returns E_JWS_B64_REJECTED', async () => {
    // Interop mode exempts missing typ from hard error but MUST NOT bypass JOSE hardening.
    // A token with no typ and b64:false must still be rejected with E_JWS_B64_REJECTED.
    const { privateKey, publicKey } = await generateKeypair();

    // Build untyped JWS (no typ field) with b64:false hazard in header
    const rawHeader = { alg: PEAC_ALG, kid: testKid, b64: false };
    const headerB64 = Buffer.from(JSON.stringify(rawHeader)).toString('base64url');
    const payloadB64 = Buffer.from(JSON.stringify(wire02JosePayload)).toString('base64url');
    const signingInput = `${headerB64}.${payloadB64}`;
    const pkcs8 = new Uint8Array(48);
    pkcs8.set(
      [
        0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x04, 0x22, 0x04,
        0x20,
      ],
      0
    );
    pkcs8.set(privateKey, 16);
    const cryptoKey = await crypto.subtle.importKey('pkcs8', pkcs8, { name: 'Ed25519' }, false, [
      'sign',
    ]);
    const sigBytes = await crypto.subtle.sign(
      { name: 'Ed25519' },
      cryptoKey,
      new TextEncoder().encode(signingInput)
    );
    const jws = `${signingInput}.${Buffer.from(sigBytes).toString('base64url')}`;

    const result = await verifyLocal(jws, publicKey, { strictness: 'interop' });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.code).toBe('E_JWS_B64_REJECTED');
    }
  });
});

// ---------------------------------------------------------------------------
// verifyLocal(): stable E_INVALID_FORMAT for malformed / oversized JWS
// ---------------------------------------------------------------------------

describe('verifyLocal(): E_INVALID_FORMAT for malformed input', () => {
  it('returns E_INVALID_FORMAT for garbage JWS (wrong number of parts)', async () => {
    const { publicKey } = await generateKeypair();
    const result = await verifyLocal('not.a.valid.jws.token', publicKey);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.code).toBe('E_INVALID_FORMAT');
    }
  });

  it('returns E_INVALID_FORMAT for oversized JWS', async () => {
    const { publicKey } = await generateKeypair();
    // Construct a JWS larger than VERIFIER_LIMITS.maxReceiptBytes (262144 bytes)
    const oversized = 'a'.repeat(262145);
    const result = await verifyLocal(oversized, publicKey);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.code).toBe('E_INVALID_FORMAT');
    }
  });

  it('returns E_INVALID_FORMAT for non-JSON header', async () => {
    const { publicKey } = await generateKeypair();
    const nonJsonB64 = Buffer.from('not-json').toString('base64url');
    const jws = `${nonJsonB64}.e30.fakesig`;
    const result = await verifyLocal(jws, publicKey);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.code).toBe('E_INVALID_FORMAT');
    }
  });
});
