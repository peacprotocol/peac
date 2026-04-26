/**
 * Composition test for the bounded observation subset.
 *
 * Proves that runBoundedValidatorShadow composes the six layer
 * validators (kernel constraints; type-extension mapping; JOSE header
 * hardening; issuer form; occurred_at temporal skew; extension byte
 * budget) into a stable aggregated result and emits each layer with
 * its proper layer tag.
 *
 * NOT a parity test against canonical (each underlying layer already
 * has its own parity test). The composition test verifies:
 *
 *   - happy path: every layer accepts -> accepted=true, no violations,
 *     no warnings
 *   - per-layer rejections show up under the expected layer tag
 *   - per-layer warnings show up under the expected layer tag
 *   - layer ordering is stable
 *   - challenge-kind skips the temporal call (mirrors canonical's
 *     evidence-kind-only contract)
 *   - missing header skips the JOSE call (no header-hardening
 *     violation when no header is supplied)
 *
 * Synthetic inputs only; no fixture-driven loop.
 */

import { describe, it, expect } from 'vitest';
import {
  runBoundedValidatorShadow,
  type BoundedValidationInput,
} from '../../src/_internal/record-core/bounded-validator';

const NOW = 1735689600; // 2025-01-01T00:00:00Z

const VALID_HEADER = {
  alg: 'EdDSA',
  typ: 'interaction-record+jwt',
  kid: 'shadow-test-kid',
} as const;

function baseHappy(): BoundedValidationInput {
  return {
    claims: {
      kind: 'evidence',
      type: 'org.peacprotocol/payment',
      iss: 'https://api.example.com',
      iat: NOW,
      extensions: {
        'org.peacprotocol/commerce': {
          payment_rail: 'stripe',
          amount_minor: '100',
          currency: 'USD',
        },
      },
    },
    header: { ...VALID_HEADER },
    now: NOW,
  };
}

describe('bounded validator composition (six layers, observation subset)', () => {
  it('happy path: all six layers accept -> accepted, no violations, no warnings', () => {
    const r = runBoundedValidatorShadow(baseHappy());
    expect(r).toEqual({ accepted: true, violations: [], warnings: [] });
  });

  it('layer: issuer-form rejection surfaces under the issuer-form tag', () => {
    const input = baseHappy();
    const r = runBoundedValidatorShadow({
      ...input,
      claims: { ...input.claims, iss: 'http://api.example.com' },
    });
    expect(r.accepted).toBe(false);
    const issErrors = r.violations.filter((v) => v.layer === 'issuer-form');
    expect(issErrors).toEqual([{ layer: 'issuer-form', code: 'E_ISS_NOT_CANONICAL' }]);
  });

  it('layer: jose-header-hardening rejection surfaces under the jose tag', () => {
    const input = baseHappy();
    const r = runBoundedValidatorShadow({
      ...input,
      header: { ...VALID_HEADER, jwk: { kty: 'OKP', crv: 'Ed25519', x: 'sample' } },
    });
    expect(r.accepted).toBe(false);
    const joseErrors = r.violations.filter((v) => v.layer === 'jose-header-hardening');
    expect(joseErrors).toEqual([
      { layer: 'jose-header-hardening', code: 'CRYPTO_JWS_EMBEDDED_KEY' },
    ]);
  });

  it('layer: missing header skips the JOSE call (no jose violation when header is undefined)', () => {
    const input = baseHappy();
    const r = runBoundedValidatorShadow({
      claims: input.claims,
      now: input.now,
    });
    expect(r.violations.find((v) => v.layer === 'jose-header-hardening')).toBeUndefined();
    expect(r.accepted).toBe(true);
  });

  it('layer: type-extension warning (unregistered type) surfaces under the type-extension-mapping tag', () => {
    const input = baseHappy();
    const r = runBoundedValidatorShadow({
      ...input,
      claims: { ...input.claims, type: 'com.example.custom/event' },
    });
    expect(r.accepted).toBe(true);
    const typeWarnings = r.warnings.filter((w) => w.layer === 'type-extension-mapping');
    expect(typeWarnings.some((w) => w.code === 'type_unregistered')).toBe(true);
  });

  it('layer: temporal occurred_at skew warning surfaces under the temporal tag (evidence kind)', () => {
    const input = baseHappy();
    const r = runBoundedValidatorShadow({
      ...input,
      claims: { ...input.claims, occurred_at: '2025-01-01T00:00:01Z' },
    });
    expect(r.accepted).toBe(true);
    expect(r.warnings).toContainEqual({
      layer: 'temporal',
      code: 'occurred_at_skew',
      path: '/occurred_at',
    });
  });

  it('layer: temporal future error surfaces under the temporal tag', () => {
    const input = baseHappy();
    const r = runBoundedValidatorShadow({
      ...input,
      claims: { ...input.claims, occurred_at: '2099-01-01T00:00:00Z' },
    });
    expect(r.accepted).toBe(false);
    expect(r.violations).toContainEqual({
      layer: 'temporal',
      code: 'E_OCCURRED_AT_FUTURE',
      path: '/occurred_at',
    });
  });

  it('layer: challenge kind skips the temporal call (no temporal entries even with occurred_at present)', () => {
    const input = baseHappy();
    const r = runBoundedValidatorShadow({
      ...input,
      claims: {
        ...input.claims,
        kind: 'challenge',
        occurred_at: '2099-01-01T00:00:00Z',
      },
    });
    expect(r.violations.find((v) => v.layer === 'temporal')).toBeUndefined();
    expect(r.warnings.find((w) => w.layer === 'temporal')).toBeUndefined();
  });

  it('layer: extension byte budget violation surfaces under the extension-budget tag', () => {
    const input = baseHappy();
    // Single extension whose group bytes exceed the per-group limit
    // (65536). Build {v: 'a'.repeat(65530)} -> JSON length 8 + 65530
    // = 65538 bytes; over per-group; under total.
    const oversized = { v: 'a'.repeat(65530) };
    const r = runBoundedValidatorShadow({
      ...input,
      claims: {
        ...input.claims,
        type: 'com.example.custom/event',
        extensions: { 'com.example/big': oversized },
      },
    });
    expect(r.accepted).toBe(false);
    expect(r.violations).toContainEqual({
      layer: 'extension-budget',
      code: 'E_EXTENSION_SIZE_EXCEEDED',
      path: '/extensions/com.example~1big',
    });
  });

  it('multiple layers fail simultaneously: all surface under their respective tags in stable order', () => {
    const input = baseHappy();
    const r = runBoundedValidatorShadow({
      ...input,
      claims: {
        ...input.claims,
        iss: 'http://api.example.com', // issuer-form fails
      },
      header: { ...VALID_HEADER, crit: ['x-flag'] }, // jose fails
    });
    expect(r.accepted).toBe(false);
    const layers = r.violations.map((v) => v.layer);
    // Composition order: kernel (none) -> issuer (1) -> jose (1).
    expect(layers).toEqual(['issuer-form', 'jose-header-hardening']);
  });

  it('purity: same input twice yields byte-equal result', () => {
    const input = baseHappy();
    const r1 = runBoundedValidatorShadow(input);
    const r2 = runBoundedValidatorShadow(input);
    expect(r2).toEqual(r1);
  });
});
