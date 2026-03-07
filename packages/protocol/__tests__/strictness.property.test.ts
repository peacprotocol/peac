/**
 * Property-based tests for strictness profiles (DD-156, DD-158)
 *
 * Verifies:
 * 1. Default is always strict: verifyLocal() with no options uses strict mode
 * 2. Unknown type does not bypass extension validation
 * 3. Interop requires explicit opt-in
 * 4. JOSE hardening applies regardless of strictness mode
 */

import { describe, it, expect, beforeAll } from 'vitest';
import * as fc from 'fast-check';
import { subtle } from 'node:crypto';
import { generateKeypair } from '@peac/crypto';
import { WIRE_02_JWS_TYP } from '@peac/kernel';
import { issueWire02, verifyLocal } from '../src/index';

// ---------------------------------------------------------------------------
// Shared keypair
// ---------------------------------------------------------------------------

let testKeypair: { privateKey: Uint8Array; publicKey: Uint8Array };
const testKid = '2026-03-07T00:00:00Z';
const testIss = 'https://api.example.com';
const testType = 'org.peacprotocol/commerce';

// PKCS8 prefix for Ed25519 raw key wrapping (RFC 8410)
const ED25519_PKCS8_PREFIX = new Uint8Array([
  0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x04, 0x22, 0x04, 0x20,
]);

async function importEd25519(privateKeyBytes: Uint8Array): Promise<CryptoKey> {
  const pkcs8 = new Uint8Array(48);
  pkcs8.set(ED25519_PKCS8_PREFIX);
  pkcs8.set(privateKeyBytes, 16);
  return subtle.importKey('pkcs8', pkcs8, { name: 'Ed25519' }, false, ['sign']);
}

function base64urlEncode(bytes: Uint8Array): string {
  const b64 = Buffer.from(bytes).toString('base64');
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64urlEncodeString(str: string): string {
  return base64urlEncode(new TextEncoder().encode(str));
}

/**
 * Sign a JWS with arbitrary header, allowing injection of hazardous fields.
 */
async function signRawJWS(
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

beforeAll(async () => {
  testKeypair = await generateKeypair();
});

// ---------------------------------------------------------------------------
// Property 1: Default is always strict
// ---------------------------------------------------------------------------

describe('Property: default strictness is strict', () => {
  it('verifyLocal() with no options runs strict mode', async () => {
    // Create a JWS with no typ (should be hard error in strict, warning in interop)
    const payload = {
      peac_version: '0.2',
      kind: 'evidence',
      type: testType,
      iss: testIss,
      iat: Math.floor(Date.now() / 1000),
      jti: 'test-strict-default',
    };

    const jws = await signRawJWS({ alg: 'EdDSA', kid: testKid }, payload, testKeypair.privateKey);

    // Default (no options)
    const strictResult = await verifyLocal(jws, testKeypair.publicKey);
    expect(strictResult.valid).toBe(false);
    if (!strictResult.valid) {
      expect(strictResult.code).toBe('E_INVALID_FORMAT');
    }

    // Explicit strict: same behavior
    const explicitStrict = await verifyLocal(jws, testKeypair.publicKey, {
      strictness: 'strict',
    });
    expect(explicitStrict.valid).toBe(false);
    if (!explicitStrict.valid) {
      expect(explicitStrict.code).toBe('E_INVALID_FORMAT');
    }

    // Interop: warning but not error
    const interopResult = await verifyLocal(jws, testKeypair.publicKey, {
      strictness: 'interop',
    });
    expect(interopResult.valid).toBe(true);
    if (interopResult.valid) {
      expect(interopResult.warnings.some((w) => w.code === 'typ_missing')).toBe(true);
    }
  });

  it('verifyLocal() with empty options object uses strict', async () => {
    const payload = {
      peac_version: '0.2',
      kind: 'evidence',
      type: testType,
      iss: testIss,
      iat: Math.floor(Date.now() / 1000),
      jti: 'test-empty-opts',
    };

    const jws = await signRawJWS({ alg: 'EdDSA', kid: testKid }, payload, testKeypair.privateKey);

    // Empty options = strict
    const result = await verifyLocal(jws, testKeypair.publicKey, {});
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.code).toBe('E_INVALID_FORMAT');
    }
  });
});

// ---------------------------------------------------------------------------
// Property 2: Unknown type does not bypass extension validation
// ---------------------------------------------------------------------------

describe('Property: unknown type does not bypass extension validation', () => {
  it('invalid extension key grammar is rejected regardless of type value', async () => {
    const types = fc.sample(
      fc
        .tuple(
          fc.constantFrom('org.peacprotocol', 'com.example', 'io.test'),
          fc.stringMatching(/^[a-z][a-z0-9_-]{0,15}$/)
        )
        .map(([d, s]) => `${d}/${s}`),
      30
    );

    for (const type of types) {
      const keypair = await generateKeypair();
      const payload = {
        peac_version: '0.2',
        kind: 'evidence',
        type,
        iss: testIss,
        iat: Math.floor(Date.now() / 1000),
        jti: `bypass-test-${type}`,
        extensions: {
          'INVALID KEY': { data: true },
        },
      };

      const jws = await signRawJWS(
        { alg: 'EdDSA', kid: testKid, typ: WIRE_02_JWS_TYP },
        payload,
        keypair.privateKey
      );

      const result = await verifyLocal(jws, keypair.publicKey);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        // Extension key grammar validation should catch this
        expect(result.code).toBe('E_INVALID_FORMAT');
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Property 3: JOSE hardening applies regardless of strictness
// ---------------------------------------------------------------------------

describe('Property: JOSE hardening is strictness-independent', () => {
  it('embedded keys rejected in both strict and interop mode', async () => {
    const payload = {
      peac_version: '0.2',
      kind: 'evidence',
      type: testType,
      iss: testIss,
      iat: Math.floor(Date.now() / 1000),
      jti: 'jose-test',
    };

    const modes: Array<'strict' | 'interop'> = ['strict', 'interop'];
    const hazards = ['jwk', 'x5c', 'x5u', 'jku'];

    for (const strictness of modes) {
      for (const hazard of hazards) {
        const jws = await signRawJWS(
          { alg: 'EdDSA', kid: testKid, typ: WIRE_02_JWS_TYP, [hazard]: {} },
          payload,
          testKeypair.privateKey
        );

        const result = await verifyLocal(jws, testKeypair.publicKey, { strictness });
        expect(result.valid).toBe(false);
        if (!result.valid) {
          expect(result.code).toBe('E_JWS_EMBEDDED_KEY');
        }
      }
    }
  });

  it('crit header rejected in both modes', async () => {
    const payload = {
      peac_version: '0.2',
      kind: 'evidence',
      type: testType,
      iss: testIss,
      iat: Math.floor(Date.now() / 1000),
      jti: 'crit-test',
    };

    for (const strictness of ['strict', 'interop'] as const) {
      const jws = await signRawJWS(
        { alg: 'EdDSA', kid: testKid, typ: WIRE_02_JWS_TYP, crit: ['exp'] },
        payload,
        testKeypair.privateKey
      );

      const result = await verifyLocal(jws, testKeypair.publicKey, { strictness });
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.code).toBe('E_JWS_CRIT_REJECTED');
      }
    }
  });
});
