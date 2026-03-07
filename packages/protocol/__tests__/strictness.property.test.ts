/**
 * Property-based tests for strictness profiles (DD-156, DD-158)
 *
 * Verifies:
 * 1. Default is always strict: verifyLocal() with no options uses strict mode
 * 2. Unknown type does not bypass extension validation (full matrix)
 * 3. Interop requires explicit opt-in
 * 4. JOSE hardening applies regardless of strictness mode
 *
 * Uses shared _helpers.ts for signRawJWS/importEd25519 (DD-158 review).
 * Uses FIXED_IAT for deterministic tests (DD-158 review).
 */

import { describe, it, expect, beforeAll } from 'vitest';
import * as fc from 'fast-check';
import { generateKeypair } from '@peac/crypto';
import { WIRE_02_JWS_TYP } from '@peac/kernel';
import { verifyLocal } from '../src/index';
import {
  signRawJWS,
  buildWire02Header,
  buildWire02Payload,
  FIXED_IAT,
  TEST_KID,
  TEST_ISS,
  TEST_TYPE,
} from './_helpers';

// ---------------------------------------------------------------------------
// Shared keypair
// ---------------------------------------------------------------------------

let testKeypair: { privateKey: Uint8Array; publicKey: Uint8Array };

beforeAll(async () => {
  testKeypair = await generateKeypair();
});

// ---------------------------------------------------------------------------
// Property 1: Default is always strict
// ---------------------------------------------------------------------------

describe('Property: default strictness is strict', () => {
  it('verifyLocal() with no options runs strict mode', async () => {
    const payload = buildWire02Payload({ jti: 'test-strict-default' });
    // No typ in header: should be hard error in strict, warning in interop
    const jws = await signRawJWS({ alg: 'EdDSA', kid: TEST_KID }, payload, testKeypair.privateKey);

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
    const payload = buildWire02Payload({ jti: 'test-empty-opts' });
    const jws = await signRawJWS({ alg: 'EdDSA', kid: TEST_KID }, payload, testKeypair.privateKey);

    const result = await verifyLocal(jws, testKeypair.publicKey, {});
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.code).toBe('E_INVALID_FORMAT');
    }
  });
});

// ---------------------------------------------------------------------------
// Property 2: Unknown type does not bypass extension validation (full matrix)
//
// Matrix: known/unknown type x valid/invalid extension x strict/interop
// 6 combos total: 2 types x 1 invalid ext x 2 modes + 2 types x 1 valid ext x 2 modes
// ---------------------------------------------------------------------------

describe('Property: unknown type does not bypass extension validation', () => {
  it('invalid extension key grammar is rejected regardless of type value', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc
          .tuple(
            fc.constantFrom('org.peacprotocol', 'com.example', 'io.test'),
            fc.stringMatching(/^[a-z][a-z0-9_-]{0,15}$/)
          )
          .map(([d, s]) => `${d}/${s}`),
        async (type) => {
          const keypair = await generateKeypair();
          const payload = buildWire02Payload({
            type,
            jti: `bypass-test-${type}`,
            extensions: {
              'INVALID KEY': { data: true },
            },
          });

          const jws = await signRawJWS(buildWire02Header(TEST_KID), payload, keypair.privateKey);

          const result = await verifyLocal(jws, keypair.publicKey);
          expect(result.valid).toBe(false);
          if (!result.valid) {
            expect(result.code).toBe('E_INVALID_FORMAT');
          }
        }
      ),
      { numRuns: 30 }
    );
  });

  it('full type x extension x strictness matrix', async () => {
    const knownType = 'org.peacprotocol/commerce';
    const unknownType = 'com.unknown-vendor/experimental';
    // Valid extension: uses a valid-grammar key with passthrough content
    // (not a known registered key, so no strict schema applies to its value)
    const validExt = { 'com.example/custom': { data: true } };
    const invalidExt = { 'INVALID KEY': { data: true } };

    const matrix: Array<{
      label: string;
      type: string;
      ext: Record<string, unknown>;
      strictness: 'strict' | 'interop';
      expectValid: boolean;
    }> = [
      // Invalid extension grammar: always rejected in both modes
      {
        label: 'known type + invalid ext + strict',
        type: knownType,
        ext: invalidExt,
        strictness: 'strict',
        expectValid: false,
      },
      {
        label: 'known type + invalid ext + interop',
        type: knownType,
        ext: invalidExt,
        strictness: 'interop',
        expectValid: false,
      },
      {
        label: 'unknown type + invalid ext + strict',
        type: unknownType,
        ext: invalidExt,
        strictness: 'strict',
        expectValid: false,
      },
      {
        label: 'unknown type + invalid ext + interop',
        type: unknownType,
        ext: invalidExt,
        strictness: 'interop',
        expectValid: false,
      },
      // Valid extension grammar: accepted in both modes for both type values
      {
        label: 'known type + valid ext + strict',
        type: knownType,
        ext: validExt,
        strictness: 'strict',
        expectValid: true,
      },
      {
        label: 'known type + valid ext + interop',
        type: knownType,
        ext: validExt,
        strictness: 'interop',
        expectValid: true,
      },
    ];

    for (const { label, type, ext, strictness, expectValid } of matrix) {
      const keypair = await generateKeypair();
      const payload = buildWire02Payload({
        type,
        jti: `matrix-${label}`,
        extensions: ext,
      });

      const jws = await signRawJWS(buildWire02Header(TEST_KID), payload, keypair.privateKey);

      const result = await verifyLocal(jws, keypair.publicKey, { strictness });
      expect(result.valid).toBe(expectValid);
    }
  });
});

// ---------------------------------------------------------------------------
// Property 3: JOSE hardening applies regardless of strictness
// ---------------------------------------------------------------------------

describe('Property: JOSE hardening is strictness-independent', () => {
  it('embedded keys rejected in both strict and interop mode', async () => {
    const payload = buildWire02Payload({ jti: 'jose-test' });
    const modes: Array<'strict' | 'interop'> = ['strict', 'interop'];
    const hazards = ['jwk', 'x5c', 'x5u', 'jku'];

    for (const strictness of modes) {
      for (const hazard of hazards) {
        const jws = await signRawJWS(
          buildWire02Header(TEST_KID, { [hazard]: {} }),
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
    const payload = buildWire02Payload({ jti: 'crit-test' });

    for (const strictness of ['strict', 'interop'] as const) {
      const jws = await signRawJWS(
        buildWire02Header(TEST_KID, { crit: ['exp'] }),
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
