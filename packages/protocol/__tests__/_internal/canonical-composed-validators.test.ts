/**
 * Per-validator unit tests for the canonical-composed validator
 * modules used by the bounded validation harness.
 *
 * Covers seven canonical-composed validators:
 *   - schema-parse (delegates to `parseReceiptClaims`)
 *   - jose-typ-strictness (mirrors `verify-local` strictness routing)
 *   - iat-not-yet-valid (mirrors `iat > now + maxClockSkew`)
 *   - policy-binding (delegates to `verifyPolicyBinding`)
 *   - unknown-extension-grammar (delegates to `isValidExtensionKey` +
 *     `REGISTERED_EXTENSION_GROUP_KEYS`)
 *   - type-extension-enforcement (delegates to
 *     `checkTypeExtensionMapping` + strictness routing)
 *   - signature (delegates to `@peac/crypto.verify`; standalone async
 *     export, not composed into `runBoundedValidatorShadow`)
 *
 * Each section asserts the wrapper's projection logic. Cross-fixture
 * byte-equality with the canonical path is asserted by the broader
 * canonical-vs-candidate differential test
 * (`parity-canonical-vs-candidate.test.ts`); these tests are focused
 * unit checks on the projection / dispatch logic.
 */

import { describe, expect, it } from 'vitest';
import { generateKeypairFromSeed } from '@peac/crypto/testkit';
import { issue } from '../../src/index.js';
import {
  validateIatNotYetValidInternal,
  validateJoseTypStrictnessInternal,
  validatePolicyBindingInternal,
  validateSchemaParseInternal,
  validateSignatureInternal,
  validateTypeExtensionEnforcementInternal,
  validateUnknownExtensionGrammarInternal,
} from '../../src/_internal/record-core/validators/index.js';

// Deterministic seed for signature tests; isolated to this file.
const FIXED_SEED = new Uint8Array([
  0x42, 0x9c, 0x1d, 0x76, 0xe3, 0x4f, 0x82, 0x55, 0x18, 0xab, 0x07, 0x60, 0xd4, 0x39, 0xc5, 0x77,
  0x21, 0x68, 0xf3, 0x4a, 0x09, 0x80, 0xee, 0x6c, 0x14, 0x95, 0x33, 0xa1, 0x47, 0x2b, 0x6e, 0xc8,
]);

// ---------------------------------------------------------------------------
// schema-parse
// ---------------------------------------------------------------------------

describe('validateSchemaParseInternal', () => {
  it('accepts a minimally-valid Wire 0.2 evidence record', () => {
    const r = validateSchemaParseInternal({
      peac_version: '0.2',
      kind: 'evidence',
      type: 'org.example/test',
      iss: 'https://issuer.example',
      iat: 1735689600,
      jti: '019b0000-0000-7000-8000-000000000abc',
    });
    expect(r.accepted).toBe(true);
    expect(r.claims).toBeDefined();
  });

  it('rejects a payload missing required fields with a canonical error code', () => {
    const r = validateSchemaParseInternal({ kind: 'evidence' });
    expect(r.accepted).toBe(false);
    expect(typeof r.errorCode).toBe('string');
    expect((r.errorCode ?? '').length).toBeGreaterThan(0);
  });

  it('rejects a non-Wire-0.2 payload with a stable error code', () => {
    const r = validateSchemaParseInternal({
      iss: 'https://issuer.example',
      aud: 'https://aud.example',
      iat: 1735689600,
      rid: '01-old-rid',
      amt: 1,
      cur: 'USD',
      payment: {
        rail: 'card',
        reference: 'r1',
        amount: 1,
        currency: 'USD',
        asset: 'USD',
        env: 'test',
        evidence: {},
      },
    });
    expect(r.accepted).toBe(false);
    expect(typeof r.errorCode).toBe('string');
    expect((r.errorCode ?? '').length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// jose-typ-strictness
// ---------------------------------------------------------------------------

describe('validateJoseTypStrictnessInternal', () => {
  it('typ present (any string) -> accepted with no warning', () => {
    expect(validateJoseTypStrictnessInternal('interaction-record+jwt', 'strict')).toEqual({
      accepted: true,
    });
    expect(validateJoseTypStrictnessInternal('arbitrary', 'interop')).toEqual({ accepted: true });
  });

  it('typ absent + strict -> rejected with E_INVALID_FORMAT', () => {
    expect(validateJoseTypStrictnessInternal(undefined, 'strict')).toEqual({
      accepted: false,
      errorCode: 'E_INVALID_FORMAT',
    });
    expect(validateJoseTypStrictnessInternal(null, 'strict')).toEqual({
      accepted: false,
      errorCode: 'E_INVALID_FORMAT',
    });
    expect(validateJoseTypStrictnessInternal('', 'strict')).toEqual({
      accepted: false,
      errorCode: 'E_INVALID_FORMAT',
    });
  });

  it('typ absent + interop -> accepted with typ_missing warning', () => {
    expect(validateJoseTypStrictnessInternal(undefined, 'interop')).toEqual({
      accepted: true,
      warnings: [{ code: 'typ_missing' }],
    });
  });
});

// ---------------------------------------------------------------------------
// iat-not-yet-valid
// ---------------------------------------------------------------------------

describe('validateIatNotYetValidInternal', () => {
  const NOW = 1735689600;
  const SKEW = 300;

  it('iat at or before now+skew -> accepted', () => {
    expect(validateIatNotYetValidInternal(NOW, NOW, SKEW)).toEqual({ accepted: true });
    expect(validateIatNotYetValidInternal(NOW + SKEW, NOW, SKEW)).toEqual({ accepted: true });
    expect(validateIatNotYetValidInternal(NOW - 100, NOW, SKEW)).toEqual({ accepted: true });
  });

  it('iat one second past now+skew -> rejected with E_NOT_YET_VALID', () => {
    expect(validateIatNotYetValidInternal(NOW + SKEW + 1, NOW, SKEW)).toEqual({
      accepted: false,
      errorCode: 'E_NOT_YET_VALID',
    });
  });

  it('zero skew enforces strict iat <= now', () => {
    expect(validateIatNotYetValidInternal(NOW, NOW, 0)).toEqual({ accepted: true });
    expect(validateIatNotYetValidInternal(NOW + 1, NOW, 0)).toEqual({
      accepted: false,
      errorCode: 'E_NOT_YET_VALID',
    });
  });
});

// ---------------------------------------------------------------------------
// policy-binding
// ---------------------------------------------------------------------------

describe('validatePolicyBindingInternal', () => {
  const D1 = 'sha256:0000000000000000000000000000000000000000000000000000000000000001';
  const D2 = 'sha256:0000000000000000000000000000000000000000000000000000000000000002';

  it('matching digests -> accepted with status verified', () => {
    expect(validatePolicyBindingInternal(D1, D1)).toEqual({
      accepted: true,
      status: 'verified',
    });
  });

  it('mismatched digests -> rejected with E_POLICY_BINDING_FAILED', () => {
    expect(validatePolicyBindingInternal(D1, D2)).toEqual({
      accepted: false,
      errorCode: 'E_POLICY_BINDING_FAILED',
      status: 'failed',
    });
  });

  it('either digest absent -> accepted with status unavailable', () => {
    expect(validatePolicyBindingInternal(undefined, D1)).toEqual({
      accepted: true,
      status: 'unavailable',
    });
    expect(validatePolicyBindingInternal(D1, undefined)).toEqual({
      accepted: true,
      status: 'unavailable',
    });
    expect(validatePolicyBindingInternal(undefined, undefined)).toEqual({
      accepted: true,
      status: 'unavailable',
    });
  });
});

// ---------------------------------------------------------------------------
// unknown-extension-grammar
// ---------------------------------------------------------------------------

describe('validateUnknownExtensionGrammarInternal', () => {
  it('extensions undefined -> accepted, no warnings', () => {
    expect(validateUnknownExtensionGrammarInternal(undefined)).toEqual({
      accepted: true,
      warnings: [],
    });
  });

  it('empty extensions object -> accepted, no warnings', () => {
    expect(validateUnknownExtensionGrammarInternal({})).toEqual({
      accepted: true,
      warnings: [],
    });
  });

  it('well-formed but unregistered key -> warning with JSON-pointer escaped path', () => {
    const r = validateUnknownExtensionGrammarInternal({ 'org.example/custom': { x: 1 } });
    expect(r.accepted).toBe(true);
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0]).toEqual({
      code: 'unknown_extension_preserved',
      pointer: '/extensions/org.example~1custom',
    });
  });

  it('multiple unregistered keys produce one warning each', () => {
    const r = validateUnknownExtensionGrammarInternal({
      'org.example/a': { x: 1 },
      'org.example/b': { y: 2 },
    });
    expect(r.warnings).toHaveLength(2);
    const pointers = r.warnings.map((w) => w.pointer).sort();
    expect(pointers).toEqual(['/extensions/org.example~1a', '/extensions/org.example~1b']);
  });
});

// ---------------------------------------------------------------------------
// type-extension-enforcement
// ---------------------------------------------------------------------------

describe('validateTypeExtensionEnforcementInternal', () => {
  it('challenge kind always skips (accepted, no warning)', () => {
    expect(
      validateTypeExtensionEnforcementInternal('challenge', 'org.example/test', undefined, 'strict')
    ).toEqual({ accepted: true });
  });

  it('unmapped type always skips (accepted, no warning)', () => {
    expect(
      validateTypeExtensionEnforcementInternal('evidence', 'org.example/unmapped', {}, 'strict')
    ).toEqual({ accepted: true });
  });
});

// ---------------------------------------------------------------------------
// signature
// ---------------------------------------------------------------------------

describe('validateSignatureInternal', () => {
  it('valid signature -> accepted', async () => {
    const { privateKey, publicKey } = await generateKeypairFromSeed(FIXED_SEED);
    const result = await issue({
      iss: 'https://issuer.example',
      kind: 'evidence',
      type: 'org.example/sig-test',
      privateKey,
      kid: 'sig-test-key',
      jti: '019b0000-0000-7000-8000-000000000sig',
      pillars: ['safety'],
    });
    const sig = await validateSignatureInternal(result.jws, publicKey);
    expect(sig.accepted).toBe(true);
    expect(sig.errorCode).toBeUndefined();
  });

  it('tampered signature -> rejected with a CRYPTO_* error code', async () => {
    const { privateKey, publicKey } = await generateKeypairFromSeed(FIXED_SEED);
    const result = await issue({
      iss: 'https://issuer.example',
      kind: 'evidence',
      type: 'org.example/sig-test',
      privateKey,
      kid: 'sig-test-key',
      jti: '019b0000-0000-7000-8000-000000000bad',
      pillars: ['safety'],
    });
    // Flip the first char of the signature segment to force a
    // mismatch. First-position flip avoids edge cases at the trailing
    // boundary; replacement char is picked from the base64url
    // alphabet to produce a structurally valid but byte-different
    // signature.
    const segments = result.jws.split('.');
    const sigSegment = segments[2];
    const original = sigSegment.charAt(0);
    const replacement = original === 'A' ? 'B' : 'A';
    const tampered = `${segments[0]}.${segments[1]}.${replacement}${sigSegment.slice(1)}`;
    const sig = await validateSignatureInternal(tampered, publicKey);
    expect(sig.accepted).toBe(false);
    expect(typeof sig.errorCode).toBe('string');
    expect((sig.errorCode ?? '').startsWith('CRYPTO_')).toBe(true);
  });

  it('malformed JWS shape -> rejected with a CRYPTO_* error code', async () => {
    const { publicKey } = await generateKeypairFromSeed(FIXED_SEED);
    const sig = await validateSignatureInternal('not-a-jws', publicKey);
    expect(sig.accepted).toBe(false);
    expect((sig.errorCode ?? '').startsWith('CRYPTO_')).toBe(true);
  });
});
