/**
 * Layer-activation proof for the canonical-composed shadow validation.
 *
 * Each new sync optional-input layer must be reachable through
 * `runBoundedValidatorShadow(...)` when its inputs are present.
 * Per-layer activation is asserted by exercising the bounded
 * validator with inputs designed to fire that layer's surface, then
 * checking the layer tag appears on the resulting `violations` or
 * `warnings` list.
 *
 * The signature wrapper is intentionally NOT in scope here. It is a
 * standalone async export and is exercised by
 * `canonical-composed-validators.test.ts`. This file covers only
 * the six sync layers wired into the bounded validator.
 *
 * Layer-by-layer activation (one assertion per layer):
 *   - schema-parse
 *   - jose-typ-strictness
 *   - iat-not-yet-valid
 *   - policy-binding
 *   - unknown-extension-grammar
 *   - type-extension-enforcement
 */

import { describe, expect, it } from 'vitest';
import {
  runBoundedValidatorShadow,
  type BoundedLayer,
} from '../../src/_internal/record-core/bounded-validator.js';

const FIXED_NOW = 1735689600;
const VALID_ISS = 'https://issuer.example';
const REGISTERED_TYPE = 'org.peacprotocol/payment';
const FIXED_DIGEST_A = 'sha256:0000000000000000000000000000000000000000000000000000000000000001';
const FIXED_DIGEST_B = 'sha256:0000000000000000000000000000000000000000000000000000000000000002';

function assertLayerFires(
  result: ReturnType<typeof runBoundedValidatorShadow>,
  layer: BoundedLayer
): void {
  const violationFired = result.violations.some((v) => v.layer === layer);
  const warningFired = result.warnings.some((w) => w.layer === layer);
  expect(violationFired || warningFired, `expected layer "${layer}" to fire`).toBe(true);
}

describe('bounded validator: sync optional-input layer activation', () => {
  it('schema-parse fires when fullClaims is supplied and the payload fails parse', () => {
    const r = runBoundedValidatorShadow({
      claims: {
        kind: 'evidence',
        type: REGISTERED_TYPE,
        iss: VALID_ISS,
        iat: FIXED_NOW,
      },
      now: FIXED_NOW,
      // Empty payload fails canonical parseReceiptClaims.
      fullClaims: {},
    });
    assertLayerFires(r, 'schema-parse');
  });

  it('jose-typ-strictness fires under strict mode when typ is absent in the header', () => {
    const r = runBoundedValidatorShadow({
      claims: {
        kind: 'evidence',
        type: REGISTERED_TYPE,
        iss: VALID_ISS,
        iat: FIXED_NOW,
      },
      header: { alg: 'EdDSA', kid: 'k1' },
      now: FIXED_NOW,
      strictness: 'strict',
    });
    assertLayerFires(r, 'jose-typ-strictness');
  });

  it('iat-not-yet-valid fires when iat is past now+maxClockSkew', () => {
    const r = runBoundedValidatorShadow({
      claims: {
        kind: 'evidence',
        type: REGISTERED_TYPE,
        iss: VALID_ISS,
        iat: FIXED_NOW + 1000,
      },
      now: FIXED_NOW,
      maxClockSkew: 0,
    });
    assertLayerFires(r, 'iat-not-yet-valid');
  });

  it('policy-binding fires when receipt and local digests are present and unequal', () => {
    const r = runBoundedValidatorShadow({
      claims: {
        kind: 'evidence',
        type: REGISTERED_TYPE,
        iss: VALID_ISS,
        iat: FIXED_NOW,
      },
      now: FIXED_NOW,
      receiptPolicyDigest: FIXED_DIGEST_A,
      localPolicyDigest: FIXED_DIGEST_B,
    });
    assertLayerFires(r, 'policy-binding');
  });

  it('unknown-extension-grammar fires when an unregistered well-formed extension key is present', () => {
    const r = runBoundedValidatorShadow({
      claims: {
        kind: 'evidence',
        type: REGISTERED_TYPE,
        iss: VALID_ISS,
        iat: FIXED_NOW,
        extensions: { 'org.example/custom': { x: 1 } },
      },
      now: FIXED_NOW,
    });
    assertLayerFires(r, 'unknown-extension-grammar');
  });

  it('type-extension-enforcement fires when strict mode is requested and the expected extension group is absent', () => {
    const r = runBoundedValidatorShadow({
      claims: {
        kind: 'evidence',
        type: REGISTERED_TYPE,
        iss: VALID_ISS,
        iat: FIXED_NOW,
      },
      now: FIXED_NOW,
      strictness: 'strict',
    });
    assertLayerFires(r, 'type-extension-enforcement');
  });
});

describe('bounded validator: optional-input layers skip when their inputs are absent', () => {
  it('schema-parse skips when fullClaims is absent', () => {
    const r = runBoundedValidatorShadow({
      claims: {
        kind: 'evidence',
        type: 'org.example/custom',
        iss: VALID_ISS,
        iat: FIXED_NOW,
      },
      now: FIXED_NOW,
    });
    const fired =
      r.violations.some((v) => v.layer === 'schema-parse') ||
      r.warnings.some((w) => w.layer === 'schema-parse');
    expect(fired).toBe(false);
  });

  it('jose-typ-strictness skips when no header or no strictness is supplied', () => {
    const r = runBoundedValidatorShadow({
      claims: {
        kind: 'evidence',
        type: 'org.example/custom',
        iss: VALID_ISS,
        iat: FIXED_NOW,
      },
      now: FIXED_NOW,
    });
    expect(r.violations.some((v) => v.layer === 'jose-typ-strictness')).toBe(false);
  });

  it('iat-not-yet-valid skips when maxClockSkew is absent', () => {
    const r = runBoundedValidatorShadow({
      claims: {
        kind: 'evidence',
        type: 'org.example/custom',
        iss: VALID_ISS,
        iat: FIXED_NOW + 1_000_000,
      },
      now: FIXED_NOW,
    });
    expect(r.violations.some((v) => v.layer === 'iat-not-yet-valid')).toBe(false);
  });

  it('policy-binding skips when either digest is absent', () => {
    const r = runBoundedValidatorShadow({
      claims: {
        kind: 'evidence',
        type: 'org.example/custom',
        iss: VALID_ISS,
        iat: FIXED_NOW,
      },
      now: FIXED_NOW,
      receiptPolicyDigest: FIXED_DIGEST_A,
    });
    expect(r.violations.some((v) => v.layer === 'policy-binding')).toBe(false);
  });

  it('type-extension-enforcement skips when strictness is absent', () => {
    const r = runBoundedValidatorShadow({
      claims: {
        kind: 'evidence',
        type: REGISTERED_TYPE,
        iss: VALID_ISS,
        iat: FIXED_NOW,
      },
      now: FIXED_NOW,
    });
    expect(r.violations.some((v) => v.layer === 'type-extension-enforcement')).toBe(false);
    expect(r.warnings.some((w) => w.layer === 'type-extension-enforcement')).toBe(false);
  });
});
